import type { HarborCatalog } from '#domain/catalog.ts'
import {
  metricDefFor,
  toCanonicalMetric,
  validateEventsAgainstCatalog,
  type ExtractedEvent,
} from '#guardrails/index.ts'
import { ok, type Result } from '#result.ts'
import type { TraceStep } from '#tracing/types.ts'

import { matchVesselOrSlipSync } from './catalogTools.ts'
import { extractLogEvents, type LlmPort } from './extractLogEvents.ts'
import { isToolOk } from './invokeTool.ts'
import {
  createMemoryEventStore,
  logEvent,
  type EventStore,
  type LoggedEvent,
} from './logEvent.ts'

export type HandleLogInput = {
  remainder: string
  operationId: string
  catalog: HarborCatalog
  llm: LlmPort
  store?: EventStore
  createEventId?: () => string
  now?: () => Date
}

export type HandleLogOutput = {
  status: 'ok' | 'needs_clarification' | 'failed'
  clarificationQuestion?: string
  events: LoggedEvent[]
  steps: TraceStep[]
  errorMessage?: string
}

function pushStep(steps: TraceStep[], step: Omit<TraceStep, 'index'>): void {
  steps.push({ ...step, index: steps.length })
}

/**
 * `/log` path: extract → match-before-mint → allowlist → unit convert → log_event.
 */
export async function handleLog(
  input: HandleLogInput,
): Promise<Result<HandleLogOutput>> {
  const steps: TraceStep[] = []
  const store = input.store ?? createMemoryEventStore()
  const startedExtract = Date.now()

  const extracted = await extractLogEvents({
    llm: input.llm,
    catalog: input.catalog,
    userText: input.remainder,
    subjectId: input.operationId,
  })

  pushStep(steps, {
    type: 'llm',
    agent: 'scribe',
    summary: extracted.error ? 'extract_failed' : 'extract_log',
    args: { remainderPreview: input.remainder.slice(0, 120) },
    result: extracted.error
      ? { error: extracted.error }
      : extracted.data.kind === 'clarification'
        ? {
            kind: 'clarification',
            question: extracted.data.question,
          }
        : { kind: extracted.data.kind },
    latencyMs: extracted.error
      ? Date.now() - startedExtract
      : (extracted.data.meta.latencyMs ?? Date.now() - startedExtract),
    tokens: extracted.error ? undefined : extracted.data.meta.tokens,
    model: extracted.error ? undefined : extracted.data.meta.model,
  })

  if (extracted.error) {
    return ok({
      status: 'failed',
      events: [],
      steps,
      errorMessage: extracted.error.message,
    })
  }

  if (extracted.data.kind === 'clarification') {
    return ok({
      status: 'needs_clarification',
      clarificationQuestion: extracted.data.question,
      events: [],
      steps,
    })
  }

  const resolved = resolveNamesToIds(
    extracted.data.events,
    input.catalog,
    steps,
  )

  const allowed = validateEventsAgainstCatalog(resolved, input.catalog)
  pushStep(steps, {
    type: 'critic',
    agent: 'critic',
    summary: allowed.error ? 'allowlist_reject' : 'allowlist_ok',
    args: { eventCount: resolved.length },
    result: allowed.error ?? { ok: true },
  })

  if (allowed.error) {
    return ok({
      status: 'failed',
      events: [],
      steps,
      errorMessage: allowed.error.message,
    })
  }

  const logged: LoggedEvent[] = []

  for (const event of allowed.data) {
    const metrics = []
    for (const m of event.metrics) {
      const def = metricDefFor(input.catalog, event.eventTypeId, m.metricKey)
      if (!def) {
        return ok({
          status: 'failed',
          events: logged,
          steps,
          errorMessage: `Missing metric def for ${m.metricKey}`,
        })
      }

      const canon = toCanonicalMetric(m, def)
      if (canon.error) {
        pushStep(steps, {
          type: 'error',
          agent: 'scribe',
          summary: 'unit_convert_failed',
          result: canon.error,
        })
        return ok({
          status: 'failed',
          events: logged,
          steps,
          errorMessage: canon.error.message,
        })
      }

      metrics.push({
        metricKey: canon.data.metricKey,
        canonicalValue: canon.data.canonicalValue,
        rawNumberValue: canon.data.rawNumberValue,
        userUnit: canon.data.userUnit,
        rawUnitToken: canon.data.rawUnitToken,
      })
    }

    const tool = await logEvent({
      store,
      event: {
        operationId: input.operationId,
        eventTypeId: event.eventTypeId,
        vesselId: event.vesselId,
        slipId: event.slipId,
        metrics,
      },
      createId: input.createEventId,
      now: input.now,
    })

    pushStep(steps, {
      type: 'tool',
      agent: 'scribe',
      tool: 'log_event',
      summary: isToolOk(tool) ? 'log_event_ok' : 'log_event_failed',
      args: {
        eventTypeId: event.eventTypeId,
        vesselId: event.vesselId,
        slipId: event.slipId,
      },
      result: isToolOk(tool) ? { id: tool.data.id } : tool.error,
      latencyMs: tool.meta.latencyMs,
    })

    if (!isToolOk(tool)) {
      return ok({
        status: 'failed',
        events: logged,
        steps,
        errorMessage: tool.error.message,
      })
    }

    logged.push(tool.data)
  }

  return ok({
    status: 'ok',
    events: logged,
    steps,
  })
}

function resolveNamesToIds(
  events: ExtractedEvent[],
  catalog: HarborCatalog,
  steps: TraceStep[],
): ExtractedEvent[] {
  return events.map(event => {
    const next = { ...event }

    if (event.vesselId && !catalog.vessels.some(v => v.id === event.vesselId)) {
      const match = matchVesselOrSlipSync(catalog, {
        entity: 'vessel',
        query: event.vesselId,
      })

      pushStep(steps, {
        type: 'tool',
        agent: 'catalog',
        tool: 'match_vessel_or_slip',
        summary: match.kind,
        args: { entity: 'vessel', query: event.vesselId },
        result: match,
      })
      if (match.kind === 'match') next.vesselId = match.id
    }

    if (event.slipId && !catalog.slips.some(s => s.id === event.slipId)) {
      const match = matchVesselOrSlipSync(catalog, {
        entity: 'slip',
        query: event.slipId,
      })

      pushStep(steps, {
        type: 'tool',
        agent: 'catalog',
        tool: 'match_vessel_or_slip',
        summary: match.kind,
        args: { entity: 'slip', query: event.slipId },
        result: match,
      })
      if (match.kind === 'match') next.slipId = match.id
    }

    return next
  })
}

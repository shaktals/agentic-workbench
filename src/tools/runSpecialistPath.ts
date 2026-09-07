import { classify, type ClassifyResult } from '#agents/classify.ts'
import type { HarborCatalog } from '#domain/catalog.ts'
import type { HitlPort } from '#hitl/port.ts'
import { ok, type Result } from '#result.ts'
import type { LlmPort } from '#tools/extractLogEvents.ts'
import type { EventStore, LoggedEvent } from '#tools/logEvent.ts'
import type { TraceStep } from '#tracing/types.ts'

import { matchVesselOrSlipSync, searchCatalogSync } from './catalogTools.ts'
import { handleLog } from './handleLog.ts'
import { handleNotice, type HandleNoticeOutput } from './handleNotice.ts'

export const DEFAULT_MAX_STEPS = 12

export type SpecialistRunInput = {
  text: string
  operationId: string
  catalog: HarborCatalog
  llm?: LlmPort
  hitl: HitlPort
  eventStore?: EventStore
  maxSteps?: number
  priorSteps?: TraceStep[]
  createEventId?: () => string
  now?: () => Date
  classifyOverride?: ClassifyResult
}

export type SpecialistRunOutput = {
  classify: ClassifyResult
  status:
    | 'ok'
    | 'ignored'
    | 'needs_clarification'
    | 'needs_approval'
    | 'failed'
    | 'denied'
    | 'max_steps'
  steps: TraceStep[]
  loggedEvents?: LoggedEvent[]
  clarificationQuestion?: string
  pendingPath?: string
  notice?: HandleNoticeOutput['draft']
  errorMessage?: string
}

function pushStep(steps: TraceStep[], step: Omit<TraceStep, 'index'>): void {
  steps.push({ ...step, index: steps.length })
}

function atMax(steps: TraceStep[], maxSteps: number): boolean {
  return steps.length >= maxSteps
}

/**
 * Classifier → exactly one specialist. Stops at maxSteps (no unbounded loop).
 */
export async function runSpecialistPath(
  input: SpecialistRunInput,
): Promise<Result<SpecialistRunOutput>> {
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS
  const steps: TraceStep[] = [...(input.priorSteps ?? [])]

  if (atMax(steps, maxSteps)) {
    return ok({
      classify: { label: 'ignore', specialist: null, reason: 'max_steps' },
      status: 'max_steps',
      steps,
      errorMessage: `Stopped at maxSteps=${maxSteps}`,
    })
  }

  const classified = input.classifyOverride ?? classify(input.text)
  pushStep(steps, {
    type: 'decision',
    agent: 'classifier',
    summary: classified.label,
    args: { textPreview: input.text.slice(0, 120) },
    result: classified,
  })

  if (atMax(steps, maxSteps)) {
    return ok({
      classify: classified,
      status: 'max_steps',
      steps,
      errorMessage: `Stopped at maxSteps=${maxSteps}`,
    })
  }

  if (classified.specialist === null) {
    return ok({ classify: classified, status: 'ignored', steps })
  }

  if (classified.specialist === 'catalog') {
    return ok(runCatalogSpecialist(input, classified, steps, maxSteps))
  }

  if (classified.specialist === 'scribe') {
    return runScribeSpecialist(input, classified, steps, maxSteps)
  }

  return runClerkSpecialist(input, classified, steps, maxSteps)
}

function runCatalogSpecialist(
  input: SpecialistRunInput,
  classified: ClassifyResult,
  steps: TraceStep[],
  maxSteps: number,
): SpecialistRunOutput {
  const hits = searchCatalogSync(input.catalog, input.text, 5)
  pushStep(steps, {
    type: 'tool',
    agent: 'catalog',
    tool: 'search_catalog',
    summary: `hits:${hits.length}`,
    args: { queryPreview: input.text.slice(0, 80) },
    result: {
      hits: hits.map(h =>
        h.kind === 'vessel'
          ? { kind: h.kind, id: h.vessel.id }
          : h.kind === 'slip'
            ? { kind: h.kind, id: h.slip.id }
            : { kind: h.kind, id: h.id },
      ),
    },
  })

  if (atMax(steps, maxSteps)) {
    return {
      classify: classified,
      status: 'max_steps',
      steps,
      errorMessage: `Stopped at maxSteps=${maxSteps}`,
    }
  }

  // Prefer an explicit vessel/slip token match when present.
  const token = input.text.split(/\s+/).find(w => w.length > 2) ?? input.text
  const vesselMatch = matchVesselOrSlipSync(input.catalog, {
    entity: 'vessel',
    query: token,
  })
  pushStep(steps, {
    type: 'tool',
    agent: 'catalog',
    tool: 'match_vessel_or_slip',
    summary: vesselMatch.kind,
    args: { entity: 'vessel', query: token },
    result: vesselMatch,
  })

  return { classify: classified, status: 'ok', steps }
}

async function runScribeSpecialist(
  input: SpecialistRunInput,
  classified: ClassifyResult,
  steps: TraceStep[],
  maxSteps: number,
): Promise<Result<SpecialistRunOutput>> {
  if (!input.llm) {
    pushStep(steps, {
      type: 'error',
      agent: 'scribe',
      summary: 'llm_port_missing',
      result: { message: 'llm is required for scribe' },
    })
    return ok({
      classify: classified,
      status: 'failed',
      steps,
      errorMessage: 'llm is required for scribe',
    })
  }

  if (atMax(steps, maxSteps)) {
    return ok({
      classify: classified,
      status: 'max_steps',
      steps,
      errorMessage: `Stopped at maxSteps=${maxSteps}`,
    })
  }

  const handled = await handleLog({
    remainder: input.text,
    operationId: input.operationId,
    catalog: input.catalog,
    llm: input.llm,
    store: input.eventStore,
    createEventId: input.createEventId,
    now: input.now,
  })

  if (handled.error) {
    pushStep(steps, {
      type: 'error',
      agent: 'scribe',
      summary: 'handle_log_failed',
      result: handled.error,
    })
    return ok({
      classify: classified,
      status: 'failed',
      steps,
      errorMessage: handled.error.message,
    })
  }

  for (const step of handled.data.steps) {
    if (atMax(steps, maxSteps)) {
      return ok({
        classify: classified,
        status: 'max_steps',
        steps,
        loggedEvents: handled.data.events,
        errorMessage: `Stopped at maxSteps=${maxSteps}`,
      })
    }
    steps.push({ ...step, index: steps.length })
  }

  return ok({
    classify: classified,
    status:
      handled.data.status === 'ok'
        ? 'ok'
        : handled.data.status === 'needs_clarification'
          ? 'needs_clarification'
          : 'failed',
    steps,
    loggedEvents: handled.data.events,
    clarificationQuestion: handled.data.clarificationQuestion,
    errorMessage: handled.data.errorMessage,
  })
}

async function runClerkSpecialist(
  input: SpecialistRunInput,
  classified: ClassifyResult,
  steps: TraceStep[],
  maxSteps: number,
): Promise<Result<SpecialistRunOutput>> {
  if (atMax(steps, maxSteps)) {
    return ok({
      classify: classified,
      status: 'max_steps',
      steps,
      errorMessage: `Stopped at maxSteps=${maxSteps}`,
    })
  }

  const handled = await handleNotice({
    remainder: input.text,
    operationId: input.operationId,
    catalog: input.catalog,
    hitl: input.hitl,
    now: input.now,
  })

  if (handled.error) {
    pushStep(steps, {
      type: 'error',
      agent: 'clerk',
      summary: 'handle_notice_failed',
      result: handled.error,
    })
    return ok({
      classify: classified,
      status: 'failed',
      steps,
      errorMessage: handled.error.message,
    })
  }

  for (const step of handled.data.steps) {
    if (atMax(steps, maxSteps)) {
      return ok({
        classify: classified,
        status: 'max_steps',
        steps,
        notice: handled.data.draft,
        errorMessage: `Stopped at maxSteps=${maxSteps}`,
      })
    }
    steps.push({ ...step, index: steps.length })
  }

  return ok({
    classify: classified,
    status:
      handled.data.status === 'sent'
        ? 'ok'
        : handled.data.status === 'needs_approval'
          ? 'needs_approval'
          : handled.data.status === 'denied'
            ? 'denied'
            : 'failed',
    steps,
    pendingPath: handled.data.pendingPath,
    notice: handled.data.draft,
    errorMessage: handled.data.errorMessage,
  })
}

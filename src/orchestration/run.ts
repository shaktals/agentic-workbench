/**
 * Harbor desk run loop (reviewer entrypoint).
 *
 * Policy graph → optional `/log` tool path (extract + allowlist + log_event).
 * Specialists / HITL notice send land in later PRs.
 */

import { ulid } from 'ulid'

import { loadHarborCatalog, type HarborCatalog } from '#domain/catalog.ts'
import { ok, type Result } from '#result.ts'
import {
  createMemoryEventStore,
  handleLog,
  type EventStore,
  type LlmPort,
  type LoggedEvent,
} from '#tools/index.ts'
import type { TraceRun, TraceRunStatus, TraceStep } from '#tracing/types.ts'

import { evaluateInbound } from './evaluateInbound.ts'
import type {
  EvaluateInboundEnv,
  InboundDecision,
  InboundMessage,
} from './types.ts'

export type RunInput = {
  inbound: InboundMessage
  env?: EvaluateInboundEnv
  /** Required when decision is `log` (tests inject a mock). */
  llm?: LlmPort
  catalog?: HarborCatalog
  eventStore?: EventStore
  /** Inject for tests. */
  now?: () => Date
  /** Inject for tests. */
  createOperationId?: () => string
  createEventId?: () => string
}

export type RunOutput = {
  operationId: string
  decision: InboundDecision
  trace: TraceRun
  /**
   * True when later PRs should invoke specialists (notice / continue).
   * False after skip, empty commands, or a finished `/log` attempt.
   */
  shouldContinue: boolean
  loggedEvents?: LoggedEvent[]
  clarificationQuestion?: string
}

function statusFor(
  decision: InboundDecision,
  logStatus?: 'ok' | 'needs_clarification' | 'failed',
): TraceRunStatus {
  if (decision.action === 'skip') return 'skipped'
  if (logStatus === 'needs_clarification') return 'needs_clarification'
  if (logStatus === 'failed') return 'failed'
  return 'ok'
}

function shouldContinueAfterDecision(decision: InboundDecision): boolean {
  switch (decision.action) {
    case 'skip':
    case 'log_empty':
    case 'notice_empty':
    case 'log':
      return false
    case 'notice':
    case 'continue':
      return true
  }
}

function summaryFor(decision: InboundDecision): string {
  switch (decision.action) {
    case 'skip':
      return `skip:${decision.reason}`
    case 'log':
      return 'log'
    case 'log_empty':
      return 'log_empty'
    case 'notice':
      return 'notice'
    case 'notice_empty':
      return 'notice_empty'
    case 'continue':
      return 'continue'
  }
}

/**
 * One inbound → operationId → decision → optional `/log` tools.
 */
export async function run(input: RunInput): Promise<Result<RunOutput>> {
  const now = input.now ?? (() => new Date())
  const createId = input.createOperationId ?? ulid
  const started = now()
  const operationId = createId()

  const decision = evaluateInbound(input.inbound, input.env ?? {})

  const steps: TraceStep[] = [
    {
      index: 0,
      type: 'decision',
      agent: 'supervisor',
      summary: summaryFor(decision),
      args: {
        inboundId: input.inbound.id,
        channel: input.inbound.channel,
        bodyPreview: input.inbound.body.slice(0, 120),
      },
      result: decision,
    },
  ]

  let logStatus: 'ok' | 'needs_clarification' | 'failed' | undefined
  let loggedEvents: LoggedEvent[] | undefined
  let clarificationQuestion: string | undefined

  if (decision.action === 'log') {
    if (!input.llm) {
      steps.push({
        index: steps.length,
        type: 'error',
        agent: 'system',
        summary: 'llm_port_missing',
        result: { message: 'llm is required for /log' },
      })
      const finished = now()

      return ok({
        operationId,
        decision,
        shouldContinue: false,
        trace: {
          operationId,
          startedAt: started.toISOString(),
          finishedAt: finished.toISOString(),
          status: 'failed',
          steps,
        },
      })
    }

    const catalog = input.catalog ?? loadHarborCatalog()
    const store = input.eventStore ?? createMemoryEventStore()
    const handled = await handleLog({
      remainder: decision.remainder,
      operationId,
      catalog,
      llm: input.llm,
      store,
      createEventId: input.createEventId,
      now,
    })

    if (handled.error) {
      steps.push({
        index: steps.length,
        type: 'error',
        agent: 'system',
        summary: 'handle_log_failed',
        result: handled.error,
      })

      const finished = now()
      return ok({
        operationId,
        decision,
        shouldContinue: false,
        trace: {
          operationId,
          startedAt: started.toISOString(),
          finishedAt: finished.toISOString(),
          status: 'failed',
          steps,
        },
      })
    }

    for (const step of handled.data.steps) {
      steps.push({ ...step, index: steps.length })
    }
    logStatus = handled.data.status
    loggedEvents = handled.data.events
    clarificationQuestion = handled.data.clarificationQuestion
  }

  const finished = now()
  const trace: TraceRun = {
    operationId,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    status: statusFor(decision, logStatus),
    steps,
  }

  return ok({
    operationId,
    decision,
    trace,
    shouldContinue: shouldContinueAfterDecision(decision),
    loggedEvents,
    clarificationQuestion,
  })
}

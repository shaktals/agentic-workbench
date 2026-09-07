/**
 * Harbor desk run loop (reviewer entrypoint).
 *
 * PR2: policy graph only — evaluate inbound, record a decision step, stop
 * before tools. Catalog extract / specialists / HITL land in later PRs.
 */

import { ulid } from 'ulid'

import { ok, type Result } from '#result.ts'
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
  /** Inject for tests. */
  now?: () => Date
  /** Inject for tests. */
  createOperationId?: () => string
}

export type RunOutput = {
  operationId: string
  decision: InboundDecision
  trace: TraceRun
  /**
   * True when a later PR should invoke tools / specialists.
   * False for skip (and for empty-command ack paths that need no model).
   */
  shouldContinue: boolean
}

function statusFor(decision: InboundDecision): TraceRunStatus {
  if (decision.action === 'skip') return 'skipped'
  return 'ok'
}

function shouldContinue(decision: InboundDecision): boolean {
  switch (decision.action) {
    case 'skip':
    case 'log_empty':
    case 'notice_empty':
      return false
    case 'log':
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
 * One inbound → one operationId → one decision step.
 * Stops before tools; `shouldContinue` signals readiness for PR3+.
 */
export function run(input: RunInput): Result<RunOutput> {
  const now = input.now ?? (() => new Date())
  const createId = input.createOperationId ?? ulid
  const started = now()
  const operationId = createId()

  const decision = evaluateInbound(input.inbound, input.env ?? {})

  const step: TraceStep = {
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
  }

  const finished = now()
  const trace: TraceRun = {
    operationId,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    status: statusFor(decision),
    steps: [step],
  }

  return ok({
    operationId,
    decision,
    trace,
    shouldContinue: shouldContinue(decision),
  })
}

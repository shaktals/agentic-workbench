/**
 * Structured traces for one agent run.
 * Persistence (jsonl) lands in a later PR; these types are the contract.
 */

export type TraceAgentId =
  | 'supervisor'
  | 'classifier'
  | 'catalog'
  | 'scribe'
  | 'clerk'
  | 'critic'
  | 'system'

export type TraceStepType =
  | 'decision'
  | 'thought'
  | 'tool'
  | 'llm'
  | 'critic'
  | 'hitl'
  | 'memory'
  | 'error'

export type TokenUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export type TraceStep = {
  /** Monotonic within a run (0-based). */
  index: number
  type: TraceStepType
  agent: TraceAgentId
  /** Wall time for this step. */
  latencyMs?: number
  /** Short human-readable summary (safe to log). */
  summary?: string
  /** Tool name when type is `tool`. */
  tool?: string
  /** Tool / decision args (avoid secrets). */
  args?: unknown
  /** Tool / decision result (avoid secrets). */
  result?: unknown
  tokens?: TokenUsage
  /** Model id when type is `llm`. */
  model?: string
}

export type TraceRunStatus =
  'ok' | 'skipped' | 'needs_clarification' | 'needs_approval' | 'failed'

export type TraceRun = {
  /** ULID stamped at run start. */
  operationId: string
  startedAt: string
  finishedAt?: string
  status?: TraceRunStatus
  steps: TraceStep[]
}

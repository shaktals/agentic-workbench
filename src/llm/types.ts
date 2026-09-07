import type { AppError } from '../result.ts'
import type { TokenUsage } from '../tracing/types.ts'

export type LlmDialogRole = 'user' | 'assistant'

export type LlmDialogMessage = {
  role: LlmDialogRole
  content: string
}

export type LlmCompletion = {
  text: string
  model: string
  latencyMs: number
  usage?: TokenUsage
}

export type CompleteChatInput = {
  systemPrompt: string
  messages: LlmDialogMessage[]
  /** Override env model for this call. */
  model?: string
  /** Default 0.7. Use 0 for structured extraction. */
  temperature?: number
  /** Ask the provider for JSON object mode when supported. */
  responseFormatJsonObject?: boolean
  /** Correlation for logs (no prompt bodies). */
  observability?: {
    caller: string
    subjectId?: string
  }
}

/** Injectable fetch for unit tests (no network). */
export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>

export type LlmRuntimeEnv = {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
}

export type LlmErrorCode =
  | 'LLM_NOT_CONFIGURED'
  | 'LLM_TIMEOUT'
  | 'LLM_HTTP_ERROR'
  | 'LLM_MALFORMED_RESPONSE'
  | 'LLM_NETWORK'

export type LlmError = AppError & {
  code: LlmErrorCode
}

import { reportError } from '../observability/reportError.ts'
import { err, ok, type Result } from '../result.ts'
import { readLlmRuntimeEnv } from './env.ts'
import type {
  CompleteChatInput,
  FetchLike,
  LlmCompletion,
  LlmError,
  LlmRuntimeEnv,
} from './types.ts'

const CHAT_COMPLETIONS_PATH = '/chat/completions'

type OpenAiUsage = {
  prompt_tokens?: unknown
  completion_tokens?: unknown
  total_tokens?: unknown
}

function extractContent(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined

  const choices = (data as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length < 1) return undefined

  const c0 = choices[0]
  if (!c0 || typeof c0 !== 'object') return undefined

  const message = (c0 as { message?: unknown }).message
  if (!message || typeof message !== 'object') return undefined

  const content = (message as { content?: unknown }).content
  return typeof content === 'string' ? content : undefined
}

function extractUsage(data: unknown): LlmCompletion['usage'] {
  if (!data || typeof data !== 'object') return undefined

  const u = (data as { usage?: OpenAiUsage }).usage
  if (!u || typeof u !== 'object') return undefined

  return {
    promptTokens:
      typeof u.prompt_tokens === 'number' ? u.prompt_tokens : undefined,
    completionTokens:
      typeof u.completion_tokens === 'number' ? u.completion_tokens : undefined,
    totalTokens:
      typeof u.total_tokens === 'number' ? u.total_tokens : undefined,
  }
}

function llmError(
  code: LlmError['code'],
  message: string,
  extras?: Pick<LlmError, 'status' | 'details'>,
): LlmError {
  return { code, message, ...extras }
}

async function fetchChat(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<Result<Response, LlmError>> {
  try {
    const response = await fetchImpl(url, init)

    return ok(response)
  } catch (e) {
    const aborted =
      signal.aborted || (e instanceof Error && e.name === 'AbortError')

    if (aborted) {
      reportError({
        scope: 'llm.timeout',
        meta: { url, timeoutMs },
        error: e,
      })
      return err(
        llmError('LLM_TIMEOUT', `LLM request timed out after ${timeoutMs}ms.`),
      )
    }

    reportError({
      scope: 'llm.network',
      meta: { url, timeoutMs },
      error: e,
    })
    return err(llmError('LLM_NETWORK', 'LLM network request failed.'))
  }
}

async function readResponseText(
  response: Response,
): Promise<Result<string, LlmError>> {
  try {
    return ok(await response.text())
  } catch (e) {
    reportError({
      scope: 'llm.response_body',
      meta: { status: response.status },
      error: e,
    })
    return err(
      llmError(
        'LLM_MALFORMED_RESPONSE',
        'LLM response body could not be read.',
      ),
    )
  }
}

function parseJsonBody(rawText: string): Result<unknown, LlmError> {
  try {
    return ok(JSON.parse(rawText) as unknown)
  } catch (e) {
    reportError({
      scope: 'llm.json_parse',
      meta: { preview: rawText.slice(0, 200) },
      error: e,
    })
    return err(
      llmError(
        'LLM_MALFORMED_RESPONSE',
        'LLM response body was not valid JSON.',
        { details: rawText.slice(0, 200) },
      ),
    )
  }
}

export type CompleteChatDeps = {
  /** Override process env resolution (tests). */
  runtime?: LlmRuntimeEnv
  /** Injectable fetch (tests). Defaults to global fetch. */
  fetch?: FetchLike
  /** Override AbortSignal (advanced tests). */
  signal?: AbortSignal
}

/**
 * Single OpenAI-compatible chat completion.
 * Provider-agnostic: point `LLM_BASE_URL` at xAI, OpenAI, or a local endpoint.
 */
export async function completeChat(
  input: CompleteChatInput,
  deps: CompleteChatDeps = {},
): Promise<Result<LlmCompletion, LlmError>> {
  const runtime =
    deps.runtime ??
    (() => {
      const resolved = readLlmRuntimeEnv()
      return resolved.configured ? resolved.value : undefined
    })()

  if (!runtime) {
    return err(
      llmError(
        'LLM_NOT_CONFIGURED',
        'LLM_API_KEY is not set. Copy .env.example to .env for the live demo.',
      ),
    )
  }

  const model = input.model?.trim() || runtime.model
  const fetchImpl = deps.fetch ?? globalThis.fetch
  const url = `${runtime.baseUrl}${CHAT_COMPLETIONS_PATH}`

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: input.systemPrompt },
      ...input.messages.map(m => ({ role: m.role, content: m.content })),
    ],
    temperature: input.temperature ?? 0.7,
  }

  if (input.responseFormatJsonObject) {
    body.response_format = { type: 'json_object' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), runtime.timeoutMs)
  const signal = deps.signal ?? controller.signal
  const started = Date.now()

  try {
    const fetched = await fetchChat(
      fetchImpl,
      url,
      {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${runtime.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      signal,
      runtime.timeoutMs,
    )
    if (fetched.error) return fetched

    const latencyMs = Date.now() - started
    const raw = await readResponseText(fetched.data)
    if (raw.error) return raw
    const rawText = raw.data

    if (!fetched.data.ok) {
      return err(
        llmError('LLM_HTTP_ERROR', `LLM HTTP ${fetched.data.status}.`, {
          status: fetched.data.status,
          details: rawText.slice(0, 500),
        }),
      )
    }

    const parsed = parseJsonBody(rawText)
    if (parsed.error) return parsed

    const text = extractContent(parsed.data)
    if (text === undefined) {
      return err(
        llmError(
          'LLM_MALFORMED_RESPONSE',
          'Missing choices[0].message.content in LLM response.',
        ),
      )
    }

    return ok({
      text,
      model,
      latencyMs,
      usage: extractUsage(parsed.data),
    })
  } finally {
    clearTimeout(timeout)
  }
}

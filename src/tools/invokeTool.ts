import { err, ok, type AppError, type Result } from '#result.ts'

export type ToolError = AppError & {
  code: 'TOOL_TIMEOUT' | 'TOOL_FAILED' | 'TOOL_INVALID_ARGS' | 'TOOL_REJECTED'
  tool: string
}

export type ToolMeta = {
  name: string
  /** Wall time including retries. */
  latencyMs: number
  attempts: number
}

export type ToolSuccess<T> = {
  data: T
  meta: ToolMeta
}

export type ToolFailure = {
  error: ToolError
  meta: ToolMeta
}

export type ToolResult<T> = ToolSuccess<T> | ToolFailure

export function isToolOk<T>(r: ToolResult<T>): r is ToolSuccess<T> {
  return !('error' in r)
}

export type InvokeToolInput<T> = {
  name: string
  fn: (signal: AbortSignal) => Promise<Result<T, AppError>>
  timeoutMs?: number
  /** Extra attempts after the first failure (default 0). */
  retries?: number
  /** Retry only when this returns true (default: timeout / TOOL_FAILED). */
  shouldRetry?: (error: AppError) => boolean
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_TIMEOUT_MS = 5_000

function defaultShouldRetry(error: AppError): boolean {
  return error.code === 'TOOL_TIMEOUT' || error.code === 'TOOL_FAILED'
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
}

function toToolError(tool: string, error: AppError): ToolError {
  if (
    error.code === 'TOOL_TIMEOUT' ||
    error.code === 'TOOL_FAILED' ||
    error.code === 'TOOL_INVALID_ARGS' ||
    error.code === 'TOOL_REJECTED'
  ) {
    return { ...error, code: error.code, tool }
  }
  return {
    code: 'TOOL_FAILED',
    message: error.message,
    tool,
    details: error.details,
    status: error.status,
  }
}

/**
 * Run a tool with timeout + bounded retries. Typed failures only — no throws.
 */
export async function invokeTool<T>(
  input: InvokeToolInput<T>,
): Promise<ToolResult<T>> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = input.retries ?? 0
  const shouldRetry = input.shouldRetry ?? defaultShouldRetry
  const sleep = input.sleep ?? defaultSleep
  const started = Date.now()
  let attempts = 0
  let lastError: ToolError | undefined

  while (attempts <= retries) {
    attempts += 1
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const abortPromise = new Promise<Result<T, AppError>>(resolve => {
        controller.signal.addEventListener(
          'abort',
          () => {
            resolve(
              err({
                code: 'TOOL_TIMEOUT',
                message: `Tool ${input.name} timed out after ${timeoutMs}ms.`,
              }),
            )
          },
          { once: true },
        )
      })

      const raced = await Promise.race([
        input.fn(controller.signal),
        abortPromise,
      ])

      if (raced.error) {
        lastError = toToolError(input.name, raced.error)
        if (attempts <= retries && shouldRetry(lastError)) {
          await sleep(Math.min(100 * attempts, 500))
          continue
        }

        return {
          error: lastError,
          meta: {
            name: input.name,
            latencyMs: Date.now() - started,
            attempts,
          },
        }
      }

      return {
        data: raced.data,
        meta: {
          name: input.name,
          latencyMs: Date.now() - started,
          attempts,
        },
      }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    error:
      lastError ??
      ({
        code: 'TOOL_FAILED',
        message: `Tool ${input.name} failed with no error detail.`,
        tool: input.name,
      } satisfies ToolError),
    meta: {
      name: input.name,
      latencyMs: Date.now() - started,
      attempts,
    },
  }
}

export { ok, err }

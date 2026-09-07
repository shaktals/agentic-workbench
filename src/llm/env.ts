import type { LlmRuntimeEnv } from './types.ts'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_TIMEOUT_MS = 90_000

function readPositiveIntFrom(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.floor(n)
}

/**
 * Read LLM env. Does not throw when the key is missing — callers decide
 * whether configuration is required (live demo vs mocked tests).
 */
export function readLlmRuntimeEnv(
  env: NodeJS.ProcessEnv = process.env,
): { configured: true; value: LlmRuntimeEnv } | { configured: false } {
  const apiKey = env.LLM_API_KEY?.trim()
  if (!apiKey) return { configured: false }

  return {
    configured: true,
    value: {
      apiKey,
      baseUrl: (env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
        /\/$/,
        '',
      ),
      model: env.LLM_MODEL?.trim() || DEFAULT_MODEL,
      timeoutMs: readPositiveIntFrom(env, 'LLM_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    },
  }
}

/** Defaults exported for tests and docs. */
export const llmEnvDefaults = {
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  timeoutMs: DEFAULT_TIMEOUT_MS,
} as const

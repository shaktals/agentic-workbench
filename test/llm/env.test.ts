import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { llmEnvDefaults, readLlmRuntimeEnv } from '#llm/env.ts'

describe('readLlmRuntimeEnv', () => {
  it('reports not configured when LLM_API_KEY is missing', () => {
    const resolved = readLlmRuntimeEnv({})
    assert.equal(resolved.configured, false)
  })

  it('reports not configured when LLM_API_KEY is blank', () => {
    const resolved = readLlmRuntimeEnv({ LLM_API_KEY: '   ' })
    assert.equal(resolved.configured, false)
  })

  it('applies defaults for base URL, model, and timeout', () => {
    const resolved = readLlmRuntimeEnv({ LLM_API_KEY: 'sk-test' })
    assert.equal(resolved.configured, true)
    if (!resolved.configured) return

    assert.equal(resolved.value.apiKey, 'sk-test')
    assert.equal(resolved.value.baseUrl, llmEnvDefaults.baseUrl)
    assert.equal(resolved.value.model, llmEnvDefaults.model)
    assert.equal(resolved.value.timeoutMs, llmEnvDefaults.timeoutMs)
  })

  it('strips a trailing slash from LLM_BASE_URL', () => {
    const resolved = readLlmRuntimeEnv({
      LLM_API_KEY: 'sk-test',
      LLM_BASE_URL: 'https://api.x.ai/v1/',
      LLM_MODEL: 'grok-2-latest',
      LLM_TIMEOUT_MS: '12000',
    })
    assert.equal(resolved.configured, true)
    if (!resolved.configured) return

    assert.equal(resolved.value.baseUrl, 'https://api.x.ai/v1')
    assert.equal(resolved.value.model, 'grok-2-latest')
    assert.equal(resolved.value.timeoutMs, 12_000)
  })

  it('falls back when LLM_TIMEOUT_MS is invalid', () => {
    const resolved = readLlmRuntimeEnv({
      LLM_API_KEY: 'sk-test',
      LLM_TIMEOUT_MS: 'nope',
    })
    assert.equal(resolved.configured, true)
    if (!resolved.configured) return
    assert.equal(resolved.value.timeoutMs, llmEnvDefaults.timeoutMs)
  })
})

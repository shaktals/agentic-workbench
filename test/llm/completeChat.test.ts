import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { completeChat } from '#llm/completeChat.ts'
import type { FetchLike, LlmRuntimeEnv } from '#llm/types.ts'

const runtime: LlmRuntimeEnv = {
  apiKey: 'sk-test',
  baseUrl: 'https://example.test/v1',
  model: 'test-model',
  timeoutMs: 50,
}

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('completeChat', () => {
  it('returns LLM_NOT_CONFIGURED when no runtime and no env key', async () => {
    const prev = process.env.LLM_API_KEY
    delete process.env.LLM_API_KEY

    try {
      const result = await completeChat(
        {
          systemPrompt: 'sys',
          messages: [{ role: 'user', content: 'hi' }],
        },
        {
          fetch: async () => {
            throw new Error('fetch must not be called')
          },
        },
      )

      assert.equal(result.error?.code, 'LLM_NOT_CONFIGURED')
      assert.equal(result.data, undefined)
    } finally {
      if (prev !== undefined) process.env.LLM_API_KEY = prev
    }
  })

  it('parses text and token usage from an OpenAI-shaped response', async () => {
    let seenUrl = ''
    let seenAuth = ''
    let seenBody: unknown

    const fetchMock: FetchLike = async (input, init) => {
      seenUrl = String(input)
      seenAuth = String(
        init?.headers && (init.headers as Record<string, string>).Authorization,
      )
      seenBody = JSON.parse(String(init?.body))
      return jsonResponse({
        choices: [{ message: { content: 'harbor ready' } }],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 4,
          total_tokens: 15,
        },
      })
    }

    const result = await completeChat(
      {
        systemPrompt: 'You are the desk.',
        messages: [{ role: 'user', content: 'status?' }],
        temperature: 0,
      },
      { runtime, fetch: fetchMock },
    )

    assert.equal(result.error, undefined)
    assert.equal(result.data?.text, 'harbor ready')
    assert.equal(result.data?.model, 'test-model')
    assert.equal(result.data?.usage?.promptTokens, 11)
    assert.equal(result.data?.usage?.completionTokens, 4)
    assert.equal(result.data?.usage?.totalTokens, 15)
    assert.ok((result.data?.latencyMs ?? -1) >= 0)

    assert.equal(seenUrl, 'https://example.test/v1/chat/completions')
    assert.equal(seenAuth, 'Bearer sk-test')
    assert.deepEqual(seenBody, {
      model: 'test-model',
      messages: [
        { role: 'system', content: 'You are the desk.' },
        { role: 'user', content: 'status?' },
      ],
      temperature: 0,
    })
  })

  it('returns LLM_MALFORMED_RESPONSE for non-JSON bodies', async () => {
    const result = await completeChat(
      {
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
      },
      {
        runtime,
        fetch: async () =>
          new Response('not-json', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          }),
      },
    )

    assert.equal(result.error?.code, 'LLM_MALFORMED_RESPONSE')
  })

  it('returns LLM_MALFORMED_RESPONSE when choices content is missing', async () => {
    const result = await completeChat(
      {
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
      },
      {
        runtime,
        fetch: async () => jsonResponse({ choices: [{ message: {} }] }),
      },
    )

    assert.equal(result.error?.code, 'LLM_MALFORMED_RESPONSE')
  })

  it('returns LLM_HTTP_ERROR with status on non-2xx', async () => {
    const result = await completeChat(
      {
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
      },
      {
        runtime,
        fetch: async () =>
          jsonResponse({ error: { message: 'boom' } }, { status: 429 }),
      },
    )

    assert.equal(result.error?.code, 'LLM_HTTP_ERROR')
    assert.equal(result.error?.status, 429)
  })

  it('returns LLM_TIMEOUT when the request is aborted', async () => {
    const result = await completeChat(
      {
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
      },
      {
        runtime: { ...runtime, timeoutMs: 5 },
        fetch: async (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const e = new Error('aborted')
              e.name = 'AbortError'
              reject(e)
            })
          }),
      },
    )

    assert.equal(result.error?.code, 'LLM_TIMEOUT')
  })

  it('forwards response_format when JSON mode is requested', async () => {
    let seenBody: Record<string, unknown> | undefined

    const result = await completeChat(
      {
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        responseFormatJsonObject: true,
        model: 'override-model',
      },
      {
        runtime,
        fetch: async (_input, init) => {
          seenBody = JSON.parse(String(init?.body))
          return jsonResponse({
            choices: [{ message: { content: '{"ok":true}' } }],
          })
        },
      },
    )

    assert.equal(result.error, undefined)
    assert.equal(seenBody?.model, 'override-model')
    assert.deepEqual(seenBody?.response_format, { type: 'json_object' })
  })
})

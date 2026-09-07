import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { err, ok } from '#result.ts'
import { invokeTool, isToolOk } from '#tools/invokeTool.ts'

describe('invokeTool', () => {
  it('returns data on success', async () => {
    const result = await invokeTool({
      name: 'noop',
      fn: async () => ok({ n: 1 }),
    })
    assert.equal(isToolOk(result), true)
    if (isToolOk(result)) assert.deepEqual(result.data, { n: 1 })
  })

  it('times out and surfaces TOOL_TIMEOUT', async () => {
    const result = await invokeTool<string>({
      name: 'slow',
      timeoutMs: 20,
      retries: 0,
      fn: async signal =>
        new Promise(resolve => {
          const t = setTimeout(() => resolve(ok('late')), 200)
          signal.addEventListener('abort', () => clearTimeout(t))
        }),
    })
    assert.equal(isToolOk(result), false)
    if (!isToolOk(result)) assert.equal(result.error.code, 'TOOL_TIMEOUT')
  })

  it('retries then succeeds', async () => {
    let attempts = 0
    const result = await invokeTool({
      name: 'flaky',
      retries: 2,
      sleep: async () => {},
      fn: async () => {
        attempts += 1
        if (attempts < 2) {
          return err({ code: 'TOOL_FAILED', message: 'transient' })
        }
        return ok('ok')
      },
    })
    assert.equal(isToolOk(result), true)
    assert.equal(attempts, 2)
  })
})

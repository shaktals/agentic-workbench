import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { err, isErr, isOk, ok } from '#result.ts'
import type { TraceRun, TraceStep } from '#tracing/types.ts'

describe('result envelope', () => {
  it('distinguishes ok and err', () => {
    const good = ok({ n: 1 })
    const bad = err({ code: 'X', message: 'nope' })

    assert.equal(isOk(good), true)
    assert.equal(isErr(good), false)
    assert.equal(isOk(bad), false)
    assert.equal(isErr(bad), true)
    assert.equal(good.data.n, 1)
    assert.equal(bad.error.code, 'X')
  })
})

describe('trace types', () => {
  it('accepts a minimal run shape', () => {
    const step: TraceStep = {
      index: 0,
      type: 'decision',
      agent: 'supervisor',
      summary: 'skip',
      args: { action: 'skip' },
      result: { reason: 'pier_not_addressed' },
    }

    const run: TraceRun = {
      operationId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      startedAt: new Date(0).toISOString(),
      status: 'skipped',
      steps: [step],
    }

    assert.equal(run.steps.length, 1)
    assert.equal(run.steps[0]?.type, 'decision')
  })
})

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  reportError,
  setReportErrorSink,
  type ReportErrorInput,
} from '#observability/reportError.ts'

afterEach(() => {
  setReportErrorSink(undefined)
})

describe('reportError', () => {
  it('forwards scope, meta, and error to the active sink', () => {
    const seen: ReportErrorInput[] = []
    setReportErrorSink(input => {
      seen.push(input)
    })

    const cause = new Error('ECONNREFUSED')
    const error = new Error('fetch failed', { cause })

    reportError({
      scope: 'llm.network',
      meta: { url: 'https://example.test/v1/chat/completions' },
      error,
    })

    assert.equal(seen.length, 1)
    assert.equal(seen[0]?.scope, 'llm.network')
    assert.deepEqual(seen[0]?.meta, {
      url: 'https://example.test/v1/chat/completions',
    })
    assert.equal(seen[0]?.error, error)
  })
})

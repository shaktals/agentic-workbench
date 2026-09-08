import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { formatTraceSummary, writeTraceJson } from '#tracing/persist.ts'
import type { TraceRun } from '#tracing/types.ts'

describe('trace persist', () => {
  it('writes run + step entries as a pretty JSON array', () => {
    const root = mkdtempSync(join(tmpdir(), 'aw-trace-'))
    try {
      const run: TraceRun = {
        operationId: 'op_trace_1',
        startedAt: '2026-09-07T18:00:00.000Z',
        finishedAt: '2026-09-07T18:00:01.000Z',
        status: 'needs_approval',
        steps: [
          {
            index: 0,
            type: 'decision',
            agent: 'supervisor',
            summary: 'notice',
          },
          {
            index: 1,
            type: 'llm',
            agent: 'scribe',
            summary: 'extract_log',
            latencyMs: 12,
            tokens: { totalTokens: 40, promptTokens: 30, completionTokens: 10 },
            model: 'mock',
          },
        ],
      }

      const { path } = writeTraceJson(run, root)
      assert.match(path, /\.json$/)
      const entries = JSON.parse(readFileSync(path, 'utf8')) as unknown[]
      assert.equal(entries.length, 3)
      assert.equal((entries[0] as { record: string }).record, 'run')
      assert.equal((entries[1] as { record: string }).record, 'step')
      assert.equal((entries[2] as { record: string }).record, 'step')
      assert.match(readFileSync(path, 'utf8'), /\n  \{\n/)
      assert.match(formatTraceSummary(run), /tokens≈40/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

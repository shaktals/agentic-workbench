import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { loadHarborCatalog } from '#domain/catalog.ts'
import { ok } from '#result.ts'
import type { LlmPort } from '#tools/extractLogEvents.ts'
import { handleLog } from '#tools/handleLog.ts'

type GoldenCase = {
  id: string
  remainder: string
  mockLlmJson: unknown
  expect: {
    status: 'ok' | 'needs_clarification' | 'failed'
    eventTypeId?: string
    vesselId?: string
    slipId?: string
    metricKey?: string
    canonicalValue?: number | boolean
    errorIncludes?: string
  }
}

const here = dirname(fileURLToPath(import.meta.url))
const goldensPath = join(here, '../../evals/log-extract.goldens.json')
const catalog = loadHarborCatalog()
const goldens = JSON.parse(readFileSync(goldensPath, 'utf8')) as {
  cases: GoldenCase[]
}

describe('log extract goldens', () => {
  for (const fx of goldens.cases) {
    it(fx.id, async () => {
      const llm: LlmPort = {
        async completeChat() {
          return ok({
            text: JSON.stringify(fx.mockLlmJson),
            model: 'mock',
            latencyMs: 1,
          })
        },
      }

      const result = await handleLog({
        remainder: fx.remainder,
        operationId: `op_${fx.id}`,
        catalog,
        llm,
        createEventId: () => `evt_${fx.id}`,
      })

      assert.equal(result.error, undefined)
      assert.equal(result.data?.status, fx.expect.status)

      if (fx.expect.status === 'ok') {
        const event = result.data?.events[0]
        assert.equal(event?.eventTypeId, fx.expect.eventTypeId)
        assert.equal(event?.vesselId, fx.expect.vesselId)
        assert.equal(event?.slipId, fx.expect.slipId)
        assert.equal(event?.metrics[0]?.metricKey, fx.expect.metricKey)
        assert.equal(
          event?.metrics[0]?.canonicalValue,
          fx.expect.canonicalValue,
        )
      }

      if (fx.expect.status === 'failed' && fx.expect.errorIncludes) {
        assert.match(
          result.data?.errorMessage ?? '',
          new RegExp(fx.expect.errorIncludes),
        )
      }
    })
  }
})

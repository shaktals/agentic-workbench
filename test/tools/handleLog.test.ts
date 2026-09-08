import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { loadHarborCatalog } from '#domain/catalog.ts'
import { ok } from '#result.ts'
import type { LlmPort } from '#tools/extractLogEvents.ts'
import { handleLog } from '#tools/handleLog.ts'
import { createMemoryEventStore } from '#tools/logEvent.ts'

const catalog = loadHarborCatalog()

function mockLlm(text: string): LlmPort {
  return {
    async completeChat() {
      return ok({
        text,
        model: 'mock',
        latencyMs: 1,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      })
    },
  }
}

describe('handleLog', () => {
  it('logs an allowlisted fuel event from mock extract JSON', async () => {
    const store = createMemoryEventStore()
    const llm = mockLlm(
      JSON.stringify({
        status: 'ok',
        events: [
          {
            eventTypeId: 'fuel_log',
            vesselId: 'v-101',
            slipId: 'slip-d4',
            metrics: [
              {
                metricKey: 'fuel_liters',
                numberValue: 40,
                rawNumberValue: 40,
                userUnit: 'liter',
                rawUnitToken: 'L',
              },
            ],
          },
        ],
      }),
    )

    const result = await handleLog({
      remainder: 'fuel 40 L on Meridian at fuel dock',
      operationId: 'op1',
      catalog,
      llm,
      store,
      createEventId: () => 'evt1',
      now: () => new Date('2026-09-07T12:00:00.000Z'),
    })

    assert.equal(result.error, undefined)
    assert.equal(result.data?.status, 'ok')
    assert.equal(result.data?.events.length, 1)
    assert.equal(store.list().length, 1)
    assert.equal(store.list()[0]?.metrics[0]?.canonicalValue, 40)
  })

  it('resolves vessel name via match-before-mint', async () => {
    const llm = mockLlm(
      JSON.stringify({
        status: 'ok',
        events: [
          {
            eventTypeId: 'fuel_log',
            vesselId: 'Meridian',
            metrics: [
              {
                metricKey: 'fuel_liters',
                numberValue: 10,
                rawNumberValue: 10,
              },
            ],
          },
        ],
      }),
    )

    const result = await handleLog({
      remainder: 'fuel 10 L Meridian',
      operationId: 'op2',
      catalog,
      llm,
      createEventId: () => 'evt2',
    })

    assert.equal(result.data?.status, 'ok')
    assert.equal(result.data?.events[0]?.vesselId, 'v-101')
    assert.ok(
      result.data?.steps.some(
        s => s.tool === 'match_vessel_or_slip' && s.summary === 'match',
      ),
    )
  })

  it('returns needs_clarification from the model', async () => {
    const llm = mockLlm(
      JSON.stringify({
        status: 'needs_clarification',
        clarificationQuestion: 'Which vessel took fuel?',
      }),
    )

    const result = await handleLog({
      remainder: 'fueled up',
      operationId: 'op3',
      catalog,
      llm,
    })

    assert.equal(result.data?.status, 'needs_clarification')
    assert.equal(result.data?.clarificationQuestion, 'Which vessel took fuel?')
    assert.equal(result.data?.events.length, 0)
    const llmStep = result.data?.steps.find(s => s.type === 'llm')
    assert.deepEqual(llmStep?.result, {
      kind: 'clarification',
      question: 'Which vessel took fuel?',
    })
  })

  it('rejects disallowed ids after mock LLM invents them', async () => {
    const llm = mockLlm(
      JSON.stringify({
        status: 'ok',
        events: [
          {
            eventTypeId: 'fuel_log',
            vesselId: 'v-ghost',
            metrics: [
              {
                metricKey: 'fuel_liters',
                numberValue: 5,
                rawNumberValue: 5,
              },
            ],
          },
        ],
      }),
    )

    const result = await handleLog({
      remainder: 'fuel on ghost ship',
      operationId: 'op4',
      catalog,
      llm,
    })

    assert.equal(result.data?.status, 'failed')
    assert.match(result.data?.errorMessage ?? '', /Unknown vesselId/)
    assert.ok(result.data?.steps.some(s => s.summary === 'allowlist_reject'))
  })
})

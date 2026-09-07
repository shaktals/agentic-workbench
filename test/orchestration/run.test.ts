import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { run } from '#orchestration/run.ts'
import type { InboundMessage } from '#orchestration/types.ts'
import { ok } from '#result.ts'
import type { LlmPort } from '#tools/extractLogEvents.ts'
import { createMemoryEventStore } from '#tools/logEvent.ts'

const fixedNow = () => new Date('2026-09-07T12:00:00.000Z')
const fixedId = () => '01PLACEHOLDEROPERATIONID0'

function msg(
  partial: Pick<InboundMessage, 'channel' | 'body'> &
    Partial<Omit<InboundMessage, 'channel' | 'body'>>,
): InboundMessage {
  return {
    id: partial.id ?? 'inbound_1',
    channel: partial.channel,
    body: partial.body,
    replyToDesk: partial.replyToDesk,
  }
}

function mockLlm(text: string): LlmPort {
  return {
    async completeChat() {
      return ok({
        text,
        model: 'mock',
        latencyMs: 1,
      })
    },
  }
}

describe('run', () => {
  it('records a skip decision and does not continue', async () => {
    const result = await run({
      inbound: msg({
        channel: 'pier',
        body: 'chatter on the pier',
      }),
      now: fixedNow,
      createOperationId: fixedId,
    })

    assert.equal(result.error, undefined)
    assert.equal(result.data?.trace.status, 'skipped')
    assert.equal(result.data?.shouldContinue, false)
    assert.deepEqual(result.data?.decision, {
      action: 'skip',
      reason: 'pier_not_addressed',
    })
    assert.equal(result.data?.trace.steps.length, 1)
    assert.equal(result.data?.trace.steps[0]?.type, 'decision')
    assert.equal(result.data?.trace.steps[0]?.agent, 'supervisor')
    assert.equal(result.data?.operationId, fixedId())
  })

  it('continues for radio free-text and stamps the decision', async () => {
    const result = await run({
      inbound: msg({
        channel: 'radio',
        body: 'need a berth hold for Aurora',
      }),
      now: fixedNow,
      createOperationId: fixedId,
    })

    assert.equal(result.error, undefined)
    assert.equal(result.data?.trace.status, 'ok')
    assert.equal(result.data?.shouldContinue, true)
    assert.deepEqual(result.data?.decision, { action: 'continue' })
  })

  it('runs /log through extract + allowlist + log_event', async () => {
    const store = createMemoryEventStore()
    const result = await run({
      inbound: msg({
        channel: 'pier',
        body: '/log fuel 20 L on V-101',
      }),
      now: fixedNow,
      createOperationId: fixedId,
      createEventId: () => 'evt_run',
      eventStore: store,
      llm: mockLlm(
        JSON.stringify({
          status: 'ok',
          events: [
            {
              eventTypeId: 'fuel_log',
              vesselId: 'v-101',
              metrics: [
                {
                  metricKey: 'fuel_liters',
                  numberValue: 20,
                  rawNumberValue: 20,
                  userUnit: 'liter',
                  rawUnitToken: 'L',
                },
              ],
            },
          ],
        }),
      ),
    })

    assert.equal(result.error, undefined)
    assert.equal(result.data?.decision.action, 'log')
    assert.equal(result.data?.shouldContinue, false)
    assert.equal(result.data?.trace.status, 'ok')
    assert.equal(result.data?.loggedEvents?.length, 1)
    assert.equal(store.list().length, 1)
    assert.ok(result.data?.trace.steps.some(s => s.tool === 'log_event'))
  })

  it('stops on empty /notice without continuing to tools', async () => {
    const result = await run({
      inbound: msg({
        channel: 'radio',
        body: '/notice',
      }),
      now: fixedNow,
      createOperationId: fixedId,
    })

    assert.equal(result.error, undefined)
    assert.equal(result.data?.shouldContinue, false)
    assert.deepEqual(result.data?.decision, { action: 'notice_empty' })
    assert.equal(result.data?.trace.status, 'ok')
  })
})

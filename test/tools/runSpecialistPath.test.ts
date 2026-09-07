import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { loadHarborCatalog } from '#domain/catalog.ts'
import { createMemoryHitlPort } from '#hitl/port.ts'
import { ok } from '#result.ts'
import type { LlmPort } from '#tools/extractLogEvents.ts'
import { runSpecialistPath } from '#tools/runSpecialistPath.ts'

const catalog = loadHarborCatalog()

function mockLlm(text: string): LlmPort {
  return {
    async completeChat() {
      return ok({ text, model: 'mock', latencyMs: 1 })
    },
  }
}

describe('runSpecialistPath', () => {
  it('chooses catalog for lookup questions', async () => {
    const result = await runSpecialistPath({
      text: 'which slip is Aurora?',
      operationId: 'op1',
      catalog,
      hitl: createMemoryHitlPort('pending'),
    })
    assert.equal(result.data?.classify.specialist, 'catalog')
    assert.equal(result.data?.status, 'ok')
    assert.ok(result.data?.steps.some(s => s.agent === 'classifier'))
  })

  it('parks clerk notice without sending', async () => {
    const result = await runSpecialistPath({
      text: 'broadcast a gale warning for outer basin near slip C3',
      operationId: 'op2',
      catalog,
      hitl: createMemoryHitlPort('pending'),
    })
    assert.equal(result.data?.classify.specialist, 'clerk')
    assert.equal(result.data?.status, 'needs_approval')
    assert.ok(
      result.data?.steps.some(
        s => s.tool === 'send_notice' && s.summary === 'parked',
      ),
    )
  })

  it('stops at maxSteps instead of looping', async () => {
    const result = await runSpecialistPath({
      text: 'which vessel is Meridian?',
      operationId: 'op3',
      catalog,
      hitl: createMemoryHitlPort('pending'),
      maxSteps: 1,
      priorSteps: [
        {
          index: 0,
          type: 'decision',
          agent: 'supervisor',
          summary: 'continue',
        },
      ],
    })
    assert.equal(result.data?.status, 'max_steps')
  })

  it('routes fuel text to scribe when LLM provided', async () => {
    const result = await runSpecialistPath({
      text: 'fuel 10 L on V-101',
      operationId: 'op4',
      catalog,
      hitl: createMemoryHitlPort('pending'),
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
                  numberValue: 10,
                  rawNumberValue: 10,
                },
              ],
            },
          ],
        }),
      ),
    })
    assert.equal(result.data?.classify.specialist, 'scribe')
    assert.equal(result.data?.status, 'ok')
  })
})

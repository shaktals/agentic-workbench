import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { loadHarborCatalog } from '#domain/catalog.ts'
import { createMemoryHitlPort } from '#hitl/port.ts'
import { handleNotice } from '#tools/handleNotice.ts'
import { runSpecialistPath } from '#tools/runSpecialistPath.ts'

type Case = {
  id: string
  text?: string
  mode?: 'notice_bad_claim'
  sourceText?: string
  badBody?: string
  expectSpecialist?: string
  expectStatus: string
  expectCriticReject?: boolean
  expectParked?: boolean
  maxSteps?: number
  priorStep?: boolean
}

const here = dirname(fileURLToPath(import.meta.url))
const goldens = JSON.parse(
  readFileSync(join(here, '../../evals/agents-hitl.goldens.json'), 'utf8'),
) as { cases: Case[] }
const catalog = loadHarborCatalog()

describe('agents + HITL goldens', () => {
  for (const fx of goldens.cases) {
    it(fx.id, async () => {
      if (fx.mode === 'notice_bad_claim') {
        const result = await handleNotice({
          remainder: fx.sourceText!,
          operationId: fx.id,
          catalog,
          hitl: createMemoryHitlPort('pending'),
          body: fx.badBody,
        })
        assert.equal(result.data?.status, fx.expectStatus)
        if (fx.expectCriticReject) {
          assert.ok(
            result.data?.steps.some(s => s.summary === 'claim_rejected'),
          )
        }
        return
      }

      const result = await runSpecialistPath({
        text: fx.text!,
        operationId: fx.id,
        catalog,
        hitl: createMemoryHitlPort('pending'),
        maxSteps: fx.maxSteps,
        priorSteps: fx.priorStep
          ? [
              {
                index: 0,
                type: 'decision',
                agent: 'supervisor',
                summary: 'continue',
              },
            ]
          : undefined,
      })

      assert.equal(result.data?.status, fx.expectStatus)
      if (fx.expectSpecialist) {
        assert.equal(result.data?.classify.specialist, fx.expectSpecialist)
      }
      if (fx.expectParked) {
        assert.ok(
          result.data?.steps.some(
            s => s.tool === 'send_notice' && s.summary === 'parked',
          ),
        )
      }
    })
  }
})

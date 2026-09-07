import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { evaluateInbound } from '#orchestration/evaluateInbound.ts'
import type { HarborChannel, InboundDecision } from '#orchestration/types.ts'

type Fixture = {
  id: string
  channel: HarborChannel
  body: string
  replyToDesk?: boolean
  expect: InboundDecision
}

const here = dirname(fileURLToPath(import.meta.url))
const fixturesPath = join(here, '../../examples/inbound-fixtures.json')

describe('inbound fixtures', () => {
  const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')) as Fixture[]

  for (const fx of fixtures) {
    it(`${fx.id} → ${fx.expect.action}`, () => {
      const decision = evaluateInbound({
        id: fx.id,
        channel: fx.channel,
        body: fx.body,
        replyToDesk: fx.replyToDesk,
      })
      assert.deepEqual(decision, fx.expect)
    })
  }
})

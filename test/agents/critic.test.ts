import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { critiqueClaim } from '#agents/critic.ts'
import { loadHarborCatalog } from '#domain/catalog.ts'

const catalog = loadHarborCatalog()

describe('critiqueClaim', () => {
  it('accepts a claim grounded in source + catalog', () => {
    const result = critiqueClaim({
      sourceText: 'gale warning near Meridian on slip B2 lasting 2 hours',
      catalog,
      claim: {
        body: 'Gale warning near Meridian on slip B2 lasting 2 hours',
        vesselId: 'v-101',
        slipId: 'slip-b2',
      },
    })
    assert.equal(result.ok, true)
  })

  it('flags a vessel not mentioned in the source', () => {
    const result = critiqueClaim({
      sourceText: 'gale warning for the outer basin',
      catalog,
      claim: {
        body: 'Gale warning for Meridian in the outer basin',
        vesselId: 'v-101',
      },
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.flags.some(f => f.code === 'UNGROUNDED_VESSEL'))
    }
  })

  it('flags an invented number', () => {
    const result = critiqueClaim({
      sourceText: 'hold berth B2 for Aurora',
      catalog,
      claim: {
        body: 'Hold berth B2 for Aurora for 12 hours',
        slipId: 'slip-b2',
        vesselId: 'v-104',
      },
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.flags.some(f => f.code === 'UNGROUNDED_NUMBER'))
    }
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { loadHarborCatalog } from '#domain/catalog.ts'
import {
  matchVesselOrSlipSync,
  searchCatalogSync,
} from '#tools/catalogTools.ts'

const catalog = loadHarborCatalog()

describe('searchCatalogSync', () => {
  it('finds vessels and slips by alias', () => {
    const hits = searchCatalogSync(catalog, 'aurora')
    assert.ok(hits.some(h => h.kind === 'vessel' && h.vessel.id === 'v-104'))

    const slips = searchCatalogSync(catalog, 'fuel dock')
    assert.ok(slips.some(h => h.kind === 'slip' && h.slip.id === 'slip-d4'))
  })
})

describe('matchVesselOrSlipSync', () => {
  it('matches an existing registration', () => {
    assert.deepEqual(
      matchVesselOrSlipSync(catalog, { entity: 'vessel', query: 'V-101' }),
      {
        kind: 'match',
        entity: 'vessel',
        id: 'v-101',
        label: 'V-101 (Meridian)',
      },
    )
  })

  it('proposes instead of minting unknown vessels', () => {
    assert.deepEqual(
      matchVesselOrSlipSync(catalog, {
        entity: 'vessel',
        query: 'SS Invented',
      }),
      {
        kind: 'proposal',
        entity: 'vessel',
        suggestedName: 'SS Invented',
        reason: 'No catalog vessel matched; proposal only — not minted.',
      },
    )
  })

  it('matches slip codes case-insensitively', () => {
    const hit = matchVesselOrSlipSync(catalog, {
      entity: 'slip',
      query: 'b2',
    })
    assert.equal(hit.kind, 'match')
    if (hit.kind === 'match') assert.equal(hit.id, 'slip-b2')
  })
})

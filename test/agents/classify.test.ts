import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { classify } from '#agents/classify.ts'

describe('classify', () => {
  it('routes weather/notice to clerk', () => {
    assert.deepEqual(classify('gale warning for outer basin'), {
      label: 'weather',
      specialist: 'clerk',
    })
    assert.deepEqual(classify('please send a notice about dredging'), {
      label: 'notice',
      specialist: 'clerk',
    })
  })

  it('routes fuel / berth hold to scribe', () => {
    assert.deepEqual(classify('fuel 40 L on Meridian'), {
      label: 'fuel_log',
      specialist: 'scribe',
    })
    assert.deepEqual(classify('hold berth B2 for Aurora'), {
      label: 'berth_hold',
      specialist: 'scribe',
    })
  })

  it('routes lookup questions to catalog', () => {
    assert.deepEqual(classify('which slip is Meridian on?'), {
      label: 'lookup',
      specialist: 'catalog',
    })
  })

  it('ignores empty chatter', () => {
    const result = classify('thanks')
    assert.equal(result.specialist, null)
    assert.equal(result.label, 'ignore')
  })
})

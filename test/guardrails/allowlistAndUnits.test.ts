import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { loadHarborCatalog } from '#domain/catalog.ts'
import {
  metricDefFor,
  toCanonicalMetric,
  validateEventsAgainstCatalog,
} from '#guardrails/index.ts'

const catalog = loadHarborCatalog()

describe('validateEventsAgainstCatalog', () => {
  it('accepts allowlisted ids and metrics', () => {
    const result = validateEventsAgainstCatalog(
      [
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
      catalog,
    )
    assert.equal(result.error, undefined)
  })

  it('rejects unknown vessel ids', () => {
    const result = validateEventsAgainstCatalog(
      [
        {
          eventTypeId: 'fuel_log',
          vesselId: 'v-999',
          metrics: [
            {
              metricKey: 'fuel_liters',
              numberValue: 1,
              rawNumberValue: 1,
            },
          ],
        },
      ],
      catalog,
    )
    assert.equal(result.error?.code, 'DISALLOWED_VESSEL')
  })

  it('rejects metrics not on the event type', () => {
    const result = validateEventsAgainstCatalog(
      [
        {
          eventTypeId: 'fuel_log',
          metrics: [
            {
              metricKey: 'berth_hold_hours',
              numberValue: 2,
              rawNumberValue: 2,
            },
          ],
        },
      ],
      catalog,
    )
    assert.equal(result.error?.code, 'DISALLOWED_METRIC')
  })
})

describe('toCanonicalMetric', () => {
  it('converts gallons to liters', () => {
    const def = metricDefFor(catalog, 'fuel_log', 'fuel_liters')!
    const result = toCanonicalMetric(
      {
        metricKey: 'fuel_liters',
        numberValue: 1,
        rawNumberValue: 1,
        userUnit: 'gallon',
        rawUnitToken: 'gal',
      },
      def,
    )
    assert.equal(result.error, undefined)
    assert.ok(typeof result.data?.canonicalValue === 'number')
    assert.ok(
      Math.abs((result.data!.canonicalValue as number) - 3.785411784) < 1e-9,
    )
  })

  it('converts minutes to hours', () => {
    const def = metricDefFor(catalog, 'berth_hold', 'berth_hold_hours')!
    const result = toCanonicalMetric(
      {
        metricKey: 'berth_hold_hours',
        numberValue: 90,
        rawNumberValue: 90,
        userUnit: 'minute',
        rawUnitToken: 'min',
      },
      def,
    )
    assert.equal(result.error, undefined)
    assert.equal(result.data?.canonicalValue, 1.5)
  })
})

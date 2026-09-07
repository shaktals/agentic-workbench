import type { MetricDef } from '#domain/catalog.ts'
import { err, ok, type Result } from '#result.ts'

export type UnitError = {
  code: 'UNIT_UNKNOWN' | 'UNIT_INCOMPATIBLE' | 'VALUE_MISSING'
  message: string
  details?: unknown
}

export type CanonicalMetric = {
  metricKey: string
  /** Value in the catalog canonical unit (or boolean as 1/0). */
  canonicalValue: number | boolean
  rawNumberValue?: number
  rawUnitToken?: string
  userUnit?: string
}

const LITER_PER_GALLON = 3.785411784

function unitErr(error: UnitError): Result<never, UnitError> {
  return err(error)
}

function normToken(token: string): string {
  return token.trim().toLowerCase()
}

function isGallon(token: string): boolean {
  const t = normToken(token)
  return t === 'gal' || t === 'gallon' || t === 'gallons'
}

function isLiter(token: string): boolean {
  const t = normToken(token)
  return (
    t === 'l' ||
    t === 'liter' ||
    t === 'liters' ||
    t === 'litre' ||
    t === 'litres'
  )
}

function isHour(token: string): boolean {
  const t = normToken(token)
  return t === 'h' || t === 'hr' || t === 'hrs' || t === 'hour' || t === 'hours'
}

function isMinute(token: string): boolean {
  const t = normToken(token)
  return t === 'min' || t === 'mins' || t === 'minute' || t === 'minutes'
}

/**
 * Convert a model-emitted metric into the catalog canonical unit.
 * The model must not pre-convert: numberValue === rawNumberValue.
 */
export function toCanonicalMetric(
  input: {
    metricKey: string
    numberValue?: number
    rawNumberValue?: number
    booleanValue?: boolean
    userUnit?: string
    rawUnitToken?: string
  },
  def: MetricDef,
): Result<CanonicalMetric, UnitError> {
  if (def.canonicalUnit === 'boolean') {
    if (typeof input.booleanValue !== 'boolean') {
      return unitErr({
        code: 'VALUE_MISSING',
        message: `Metric ${def.key} requires booleanValue.`,
      })
    }
    return ok({
      metricKey: def.key,
      canonicalValue: input.booleanValue,
    })
  }

  const raw =
    input.rawNumberValue !== undefined
      ? input.rawNumberValue
      : input.numberValue

  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return unitErr({
      code: 'VALUE_MISSING',
      message: `Metric ${def.key} requires a numeric value.`,
    })
  }

  const token = input.userUnit ?? input.rawUnitToken
  if (token !== undefined) {
    const listed = def.unitTokens.some(t => normToken(t) === normToken(token))
    if (!listed) {
      return unitErr({
        code: 'UNIT_UNKNOWN',
        message: `Unit "${token}" is not allowed for ${def.key}.`,
        details: { allowed: def.unitTokens },
      })
    }
  }

  if (def.canonicalUnit === 'liter') {
    if (!token) {
      return ok({
        metricKey: def.key,
        canonicalValue: raw,
        rawNumberValue: raw,
      })
    }
    if (isLiter(token)) {
      return ok({
        metricKey: def.key,
        canonicalValue: raw,
        rawNumberValue: raw,
        userUnit: 'liter',
        rawUnitToken: token,
      })
    }
    if (isGallon(token)) {
      return ok({
        metricKey: def.key,
        canonicalValue: raw * LITER_PER_GALLON,
        rawNumberValue: raw,
        userUnit: 'gallon',
        rawUnitToken: token,
      })
    }
    return unitErr({
      code: 'UNIT_INCOMPATIBLE',
      message: `Cannot convert "${token}" to liters for ${def.key}.`,
    })
  }

  if (!token) {
    return ok({
      metricKey: def.key,
      canonicalValue: raw,
      rawNumberValue: raw,
    })
  }
  if (isHour(token)) {
    return ok({
      metricKey: def.key,
      canonicalValue: raw,
      rawNumberValue: raw,
      userUnit: 'hour',
      rawUnitToken: token,
    })
  }
  if (isMinute(token)) {
    return ok({
      metricKey: def.key,
      canonicalValue: raw / 60,
      rawNumberValue: raw,
      userUnit: 'minute',
      rawUnitToken: token,
    })
  }

  return unitErr({
    code: 'UNIT_INCOMPATIBLE',
    message: `Cannot convert "${token}" to hours for ${def.key}.`,
  })
}

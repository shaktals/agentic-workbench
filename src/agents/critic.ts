import type { HarborCatalog } from '#domain/catalog.ts'

export type CriticFlag = {
  code:
    | 'UNGROUNDED_VESSEL'
    | 'UNGROUNDED_SLIP'
    | 'UNGROUNDED_NUMBER'
    | 'EMPTY_CLAIM'
  message: string
}

export type CriticInput = {
  sourceText: string
  catalog: HarborCatalog
  claim: {
    body: string
    vesselId?: string
    slipId?: string
  }
}

export type CriticResult = { ok: true } | { ok: false; flags: CriticFlag[] }

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function sourceHas(source: string, token: string): boolean {
  return norm(source).includes(norm(token))
}

/**
 * Deterministic critic: claims must be grounded in source text and/or catalog.
 * Runs after allowlist-style id checks (caller may run those first).
 */
export function critiqueClaim(input: CriticInput): CriticResult {
  const flags: CriticFlag[] = []
  const body = input.claim.body.trim()
  if (!body) {
    return {
      ok: false,
      flags: [{ code: 'EMPTY_CLAIM', message: 'Claim body is empty.' }],
    }
  }

  const source = input.sourceText

  if (input.claim.vesselId) {
    const vessel = input.catalog.vessels.find(
      v => v.id === input.claim.vesselId,
    )
    if (!vessel) {
      flags.push({
        code: 'UNGROUNDED_VESSEL',
        message: `vesselId ${input.claim.vesselId} is not in the catalog.`,
      })
    } else {
      const grounded =
        sourceHas(source, vessel.id) ||
        sourceHas(source, vessel.registration) ||
        sourceHas(source, vessel.name) ||
        vessel.aliases.some(a => sourceHas(source, a))

      if (!grounded) {
        flags.push({
          code: 'UNGROUNDED_VESSEL',
          message: `Vessel ${vessel.registration} is not mentioned in the source text.`,
        })
      }
    }
  }

  if (input.claim.slipId) {
    const slip = input.catalog.slips.find(s => s.id === input.claim.slipId)

    if (!slip) {
      flags.push({
        code: 'UNGROUNDED_SLIP',
        message: `slipId ${input.claim.slipId} is not in the catalog.`,
      })
    } else {
      const grounded =
        sourceHas(source, slip.id) ||
        sourceHas(source, slip.code) ||
        sourceHas(source, slip.name) ||
        slip.aliases.some(a => sourceHas(source, a))

      if (!grounded) {
        flags.push({
          code: 'UNGROUNDED_SLIP',
          message: `Slip ${slip.code} is not mentioned in the source text.`,
        })
      }
    }
  }

  // Flag numbers in the claim that never appear in the source (invented magnitudes).
  const claimNumbers = body.match(/\d+(?:\.\d+)?/g) ?? []
  for (const n of claimNumbers) {
    if (!sourceHas(source, n)) {
      flags.push({
        code: 'UNGROUNDED_NUMBER',
        message: `Number ${n} in the claim is not present in the source text.`,
      })
    }
  }

  if (flags.length > 0) return { ok: false, flags }
  return { ok: true }
}

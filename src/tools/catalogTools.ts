import type { HarborCatalog, Slip, Vessel } from '#domain/catalog.ts'
import { err, ok, type Result } from '#result.ts'

import { invokeTool, type ToolResult } from './invokeTool.ts'

export type CatalogHit =
  | { kind: 'slip'; slip: Slip }
  | { kind: 'vessel'; vessel: Vessel }
  | { kind: 'eventType'; id: string; label: string }

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function includesQuery(haystack: string, query: string): boolean {
  return norm(haystack).includes(query)
}

/** Ranked substring search over slips, vessels, and event types. */
export function searchCatalogSync(
  catalog: HarborCatalog,
  query: string,
  limit = 10,
): CatalogHit[] {
  const q = norm(query)
  if (!q) return []

  const hits: CatalogHit[] = []

  for (const slip of catalog.slips) {
    if (
      includesQuery(slip.id, q) ||
      includesQuery(slip.code, q) ||
      includesQuery(slip.name, q) ||
      slip.aliases.some(a => includesQuery(a, q))
    ) {
      hits.push({ kind: 'slip', slip })
    }
  }

  for (const vessel of catalog.vessels) {
    if (
      includesQuery(vessel.id, q) ||
      includesQuery(vessel.registration, q) ||
      includesQuery(vessel.name, q) ||
      vessel.aliases.some(a => includesQuery(a, q))
    ) {
      hits.push({ kind: 'vessel', vessel })
    }
  }

  for (const event of catalog.eventTypes) {
    if (includesQuery(event.id, q) || includesQuery(event.label, q)) {
      hits.push({ kind: 'eventType', id: event.id, label: event.label })
    }
  }

  return hits.slice(0, limit)
}

export async function searchCatalog(input: {
  catalog: HarborCatalog
  query: string
  limit?: number
}): Promise<ToolResult<CatalogHit[]>> {
  return invokeTool({
    name: 'search_catalog',
    fn: async () =>
      ok(searchCatalogSync(input.catalog, input.query, input.limit)),
  })
}

export type MatchResult =
  | { kind: 'match'; entity: 'vessel' | 'slip'; id: string; label: string }
  | {
      kind: 'proposal'
      entity: 'vessel' | 'slip'
      suggestedName: string
      reason: string
    }
  | { kind: 'none'; entity: 'vessel' | 'slip'; query: string }

function exactVessel(
  catalog: HarborCatalog,
  query: string,
): Vessel | undefined {
  const q = norm(query)
  return catalog.vessels.find(
    v =>
      norm(v.id) === q ||
      norm(v.registration) === q ||
      norm(v.name) === q ||
      v.aliases.some(a => norm(a) === q),
  )
}

function exactSlip(catalog: HarborCatalog, query: string): Slip | undefined {
  const q = norm(query)
  return catalog.slips.find(
    s =>
      norm(s.id) === q ||
      norm(s.code) === q ||
      norm(s.name) === q ||
      s.aliases.some(a => norm(a) === q),
  )
}

/**
 * Match-before-mint: return an existing id or a proposal — never invent an id.
 */
export function matchVesselOrSlipSync(
  catalog: HarborCatalog,
  input: { entity: 'vessel' | 'slip'; query: string },
): MatchResult {
  const q = input.query.trim()
  if (!q) {
    return { kind: 'none', entity: input.entity, query: q }
  }

  if (input.entity === 'vessel') {
    const hit = exactVessel(catalog, q)
    if (hit) {
      return {
        kind: 'match',
        entity: 'vessel',
        id: hit.id,
        label: `${hit.registration} (${hit.name})`,
      }
    }

    return {
      kind: 'proposal',
      entity: 'vessel',
      suggestedName: q,
      reason: 'No catalog vessel matched; proposal only — not minted.',
    }
  }

  const hit = exactSlip(catalog, q)
  if (hit) {
    return {
      kind: 'match',
      entity: 'slip',
      id: hit.id,
      label: `${hit.code} (${hit.name})`,
    }
  }

  return {
    kind: 'proposal',
    entity: 'slip',
    suggestedName: q,
    reason: 'No catalog slip matched; proposal only — not minted.',
  }
}

export async function matchVesselOrSlip(input: {
  catalog: HarborCatalog
  entity: 'vessel' | 'slip'
  query: string
}): Promise<ToolResult<MatchResult>> {
  return invokeTool({
    name: 'match_vessel_or_slip',
    fn: async () => {
      const result = matchVesselOrSlipSync(input.catalog, {
        entity: input.entity,
        query: input.query,
      })
      return ok(result)
    },
  })
}

/** Exported for tests that assert helper purity without the wrapper. */
export function assertCatalogLoaded(
  catalog: HarborCatalog | undefined,
): Result<HarborCatalog, { code: string; message: string }> {
  if (!catalog) {
    return err({ code: 'TOOL_INVALID_ARGS', message: 'Catalog is required.' })
  }
  return ok(catalog)
}

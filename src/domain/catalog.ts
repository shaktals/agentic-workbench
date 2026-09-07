import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

const metricDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  canonicalUnit: z.enum(['liter', 'hour', 'boolean']),
  unitTokens: z.array(z.string()),
})

const eventTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  metrics: z.array(metricDefSchema).min(1),
})

const slipSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()),
})

const vesselSchema = z.object({
  id: z.string().min(1),
  registration: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()),
})

export const harborCatalogSchema = z.object({
  slips: z.array(slipSchema).min(1),
  vessels: z.array(vesselSchema).min(1),
  eventTypes: z.array(eventTypeSchema).min(1),
})

export type HarborCatalog = z.infer<typeof harborCatalogSchema>
export type Slip = HarborCatalog['slips'][number]
export type Vessel = HarborCatalog['vessels'][number]
export type EventType = HarborCatalog['eventTypes'][number]
export type MetricDef = EventType['metrics'][number]

const here = dirname(fileURLToPath(import.meta.url))
const defaultCatalogPath = join(here, '../../fixtures/catalog.json')

/** Load and validate the harbor catalog (fail closed on schema drift). */
export function loadHarborCatalog(
  path: string = defaultCatalogPath,
): HarborCatalog {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
  return harborCatalogSchema.parse(raw)
}

export function buildCatalogMarkdown(catalog: HarborCatalog): string {
  const slips = catalog.slips
    .map(s => `- slip id=${s.id} code=${s.code} name=${s.name}`)
    .join('\n')
  const vessels = catalog.vessels
    .map(
      v => `- vessel id=${v.id} registration=${v.registration} name=${v.name}`,
    )
    .join('\n')
  const events = catalog.eventTypes
    .map(e => {
      const metrics = e.metrics
        .map(
          m =>
            `    - metricKey=${m.key} canonicalUnit=${m.canonicalUnit} tokens=[${m.unitTokens.join(', ')}]`,
        )
        .join('\n')
      return `- eventTypeId=${e.id} (${e.label})\n${metrics}`
    })
    .join('\n')

  return [
    'Slips (use id only):',
    slips,
    '',
    'Vessels (use id only):',
    vessels,
    '',
    'Event types + metrics (use ids/keys only):',
    events,
  ].join('\n')
}

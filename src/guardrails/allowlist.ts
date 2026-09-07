import type { HarborCatalog, MetricDef } from '#domain/catalog.ts'
import { err, ok, type Result } from '#result.ts'

export type AllowlistError = {
  code:
    | 'DISALLOWED_EVENT_TYPE'
    | 'DISALLOWED_VESSEL'
    | 'DISALLOWED_SLIP'
    | 'DISALLOWED_METRIC'
  message: string
  details?: unknown
}

export type ExtractedMetric = {
  metricKey: string
  numberValue?: number
  rawNumberValue?: number
  booleanValue?: boolean
  userUnit?: string
  rawUnitToken?: string
}

export type ExtractedEvent = {
  eventTypeId: string
  vesselId?: string
  slipId?: string
  metrics: ExtractedMetric[]
}

function allowlistErr(error: AllowlistError): Result<never, AllowlistError> {
  return err(error)
}

/** Server-side allowlist: catalog owns truth; model output is untrusted. */
export function validateEventsAgainstCatalog(
  events: ExtractedEvent[],
  catalog: HarborCatalog,
): Result<ExtractedEvent[], AllowlistError> {
  const eventIds = new Set(catalog.eventTypes.map(e => e.id))
  const vesselIds = new Set(catalog.vessels.map(v => v.id))
  const slipIds = new Set(catalog.slips.map(s => s.id))
  const metricsByEvent = new Map(
    catalog.eventTypes.map(e => [
      e.id,
      new Map(e.metrics.map(m => [m.key, m])),
    ]),
  )

  for (const event of events) {
    if (!eventIds.has(event.eventTypeId)) {
      return allowlistErr({
        code: 'DISALLOWED_EVENT_TYPE',
        message: `Unknown eventTypeId: ${event.eventTypeId}`,
        details: { eventTypeId: event.eventTypeId },
      })
    }

    if (event.vesselId !== undefined && !vesselIds.has(event.vesselId)) {
      return allowlistErr({
        code: 'DISALLOWED_VESSEL',
        message: `Unknown vesselId: ${event.vesselId}`,
        details: { vesselId: event.vesselId },
      })
    }

    if (event.slipId !== undefined && !slipIds.has(event.slipId)) {
      return allowlistErr({
        code: 'DISALLOWED_SLIP',
        message: `Unknown slipId: ${event.slipId}`,
        details: { slipId: event.slipId },
      })
    }

    const allowed = metricsByEvent.get(event.eventTypeId)!
    for (const metric of event.metrics) {
      if (!allowed.has(metric.metricKey)) {
        return allowlistErr({
          code: 'DISALLOWED_METRIC',
          message: `Metric ${metric.metricKey} is not allowed on ${event.eventTypeId}`,
          details: {
            eventTypeId: event.eventTypeId,
            metricKey: metric.metricKey,
            allowed: [...allowed.keys()],
          },
        })
      }
    }
  }

  return ok(events)
}

export function metricDefFor(
  catalog: HarborCatalog,
  eventTypeId: string,
  metricKey: string,
): MetricDef | undefined {
  const event = catalog.eventTypes.find(e => e.id === eventTypeId)
  return event?.metrics.find(m => m.key === metricKey)
}

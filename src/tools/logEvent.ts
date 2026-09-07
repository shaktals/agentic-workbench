import { err, ok } from '#result.ts'

import { invokeTool, type ToolResult } from './invokeTool.ts'

export type LoggedEvent = {
  id: string
  operationId: string
  eventTypeId: string
  vesselId?: string
  slipId?: string
  metrics: Array<{
    metricKey: string
    canonicalValue: number | boolean
    rawNumberValue?: number
    userUnit?: string
    rawUnitToken?: string
  }>
  note?: string
  createdAt: string
}

export type EventStore = {
  append(event: LoggedEvent): void
  list(): readonly LoggedEvent[]
}

export function createMemoryEventStore(): EventStore {
  const rows: LoggedEvent[] = []
  return {
    append(event) {
      rows.push(event)
    },
    list() {
      return rows
    },
  }
}

export type LogEventInput = {
  store: EventStore
  event: Omit<LoggedEvent, 'id' | 'createdAt'> & {
    id?: string
    createdAt?: string
  }
  createId?: () => string
  now?: () => Date
}

/** Persist a schema-validated, allowlisted harbor event. */
export async function logEvent(
  input: LogEventInput,
): Promise<ToolResult<LoggedEvent>> {
  return invokeTool({
    name: 'log_event',
    fn: async () => {
      if (!input.event.eventTypeId.trim()) {
        return err({
          code: 'TOOL_INVALID_ARGS',
          message: 'eventTypeId is required.',
        })
      }
      if (!input.event.metrics.length) {
        return err({
          code: 'TOOL_INVALID_ARGS',
          message: 'At least one metric is required.',
        })
      }

      const createId = input.createId ?? (() => crypto.randomUUID())
      const now = input.now ?? (() => new Date())
      const row: LoggedEvent = {
        id: input.event.id ?? createId(),
        operationId: input.event.operationId,
        eventTypeId: input.event.eventTypeId,
        vesselId: input.event.vesselId,
        slipId: input.event.slipId,
        metrics: input.event.metrics,
        note: input.event.note,
        createdAt: input.event.createdAt ?? now().toISOString(),
      }
      input.store.append(row)

      return ok(row)
    },
  })
}

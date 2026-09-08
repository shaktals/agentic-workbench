/**
 * Harbor desk run loop (reviewer entrypoint).
 *
 * Policy graph → `/log` scribe path, or classifier → one specialist.
 * Outbound `send_notice` parks for human approval (HITL).
 * Optional memory + JSON traces under `var/`.
 */

import { ulid } from 'ulid'

import { loadHarborCatalog, type HarborCatalog } from '#domain/catalog.ts'
import {
  createFileHitlPort,
  createMemoryHitlPort,
  type HitlPort,
  type NoticeDraft,
} from '#hitl/port.ts'
import {
  createMemoryPort,
  defaultMemoryFilePath,
  type MemoryPort,
} from '#memory/index.ts'
import { ok, type Result } from '#result.ts'
import {
  createMemoryEventStore,
  handleLog,
  runSpecialistPath,
  type EventStore,
  type LlmPort,
  type LoggedEvent,
} from '#tools/index.ts'
import {
  formatTraceSummary,
  writeTraceJson,
  type TraceRun,
  type TraceRunStatus,
  type TraceStep,
} from '#tracing/index.ts'

import { evaluateInbound } from './evaluateInbound.ts'
import type {
  EvaluateInboundEnv,
  InboundDecision,
  InboundMessage,
} from './types.ts'

export type RunInput = {
  inbound: InboundMessage
  env?: EvaluateInboundEnv
  /** Required for `/log` and scribe specialist paths. */
  llm?: LlmPort
  catalog?: HarborCatalog
  eventStore?: EventStore
  /** Defaults to in-memory pending (tests). File port used when hitlRootDir set. */
  hitl?: HitlPort
  /** When set (and hitl omitted), use file HITL under this root (`var/`). */
  hitlRootDir?: string
  /** Auto-approve sends (demo `--yes` only). */
  autoApprove?: boolean
  maxSteps?: number
  /** Thread id for scratchpad / long-term memory (defaults to inbound.id). */
  threadId?: string
  memory?: MemoryPort
  /** Persist memory notes under this root (`var/memory.json`). */
  memoryRootDir?: string
  /** When true (default if varRoot set), write `var/traces/<id>.json`. */
  persistTrace?: boolean
  /** Root for traces + default HITL/memory dirs. */
  varRootDir?: string
  now?: () => Date
  createOperationId?: () => string
  createEventId?: () => string
}

export type RunOutput = {
  operationId: string
  decision: InboundDecision
  trace: TraceRun
  shouldContinue: boolean
  loggedEvents?: LoggedEvent[]
  clarificationQuestion?: string
  pendingPath?: string
  notice?: NoticeDraft
  tracePath?: string
  traceSummary?: string
}

function resolveHitl(input: RunInput): HitlPort {
  if (input.hitl) return input.hitl
  const root = input.hitlRootDir ?? input.varRootDir
  if (root) {
    return createFileHitlPort({
      rootDir: root,
      autoApprove: input.autoApprove === true,
    })
  }
  return createMemoryHitlPort(input.autoApprove ? 'approved' : 'pending')
}

function resolveMemory(input: RunInput): MemoryPort | undefined {
  if (input.memory) return input.memory
  const root = input.memoryRootDir ?? input.varRootDir
  if (!root) return undefined
  return createMemoryPort({ filePath: defaultMemoryFilePath(root) })
}

function pushStep(steps: TraceStep[], step: Omit<TraceStep, 'index'>): void {
  steps.push({ ...step, index: steps.length })
}

/**
 * One inbound → operationId → decision → tools / specialists / HITL.
 */
export async function run(input: RunInput): Promise<Result<RunOutput>> {
  const now = input.now ?? (() => new Date())
  const createId = input.createOperationId ?? ulid
  const started = now()
  const operationId = createId()
  const catalog = input.catalog ?? loadHarborCatalog()
  const hitl = resolveHitl(input)
  const memory = resolveMemory(input)
  const threadId = input.threadId ?? input.inbound.id

  const decision = evaluateInbound(input.inbound, input.env ?? {})

  const steps: TraceStep[] = [
    {
      index: 0,
      type: 'decision',
      agent: 'supervisor',
      summary: summaryFor(decision),
      args: {
        inboundId: input.inbound.id,
        channel: input.inbound.channel,
        bodyPreview: input.inbound.body.slice(0, 120),
      },
      result: decision,
    },
  ]

  if (memory) {
    memory.appendScratch(
      threadId,
      `inbound:${input.inbound.body.slice(0, 200)}`,
    )
    const selfNotes = memory.retrieveForSelfContext(threadId, 5)
    pushStep(steps, {
      type: 'memory',
      agent: 'system',
      summary: `scratch+self_notes:${selfNotes.length}`,
      args: { threadId },
      result: {
        scratchLines: memory.readScratch(threadId).lines.length,
        selfContextNotes: selfNotes.map(n => n.id),
      },
    })
  }

  let status: TraceRunStatus = decision.action === 'skip' ? 'skipped' : 'ok'
  let loggedEvents: LoggedEvent[] | undefined
  let clarificationQuestion: string | undefined
  let pendingPath: string | undefined
  let notice: NoticeDraft | undefined
  const shouldContinue = false

  if (decision.action === 'log') {
    const result = await runLogPath({
      input,
      decision,
      operationId,
      catalog,
      steps,
      now,
    })
    status = result.status
    loggedEvents = result.loggedEvents
    clarificationQuestion = result.clarificationQuestion
  } else if (decision.action === 'notice') {
    const result = await runNoticeCommand({
      input,
      remainder: decision.remainder,
      operationId,
      catalog,
      hitl,
      steps,
      now,
    })
    status = result.status
    pendingPath = result.pendingPath
    notice = result.notice
  } else if (decision.action === 'continue') {
    const text = input.inbound.body
    const specialist = await runSpecialistPath({
      text,
      operationId,
      catalog,
      llm: input.llm,
      hitl,
      eventStore: input.eventStore,
      maxSteps: input.maxSteps,
      priorSteps: steps,
      createEventId: input.createEventId,
      now,
    })

    if (specialist.error) {
      pushStep(steps, {
        type: 'error',
        agent: 'system',
        summary: 'specialist_failed',
        result: specialist.error,
      })
      status = 'failed'
    } else {
      steps.length = 0
      steps.push(...specialist.data.steps)
      loggedEvents = specialist.data.loggedEvents
      clarificationQuestion = specialist.data.clarificationQuestion
      pendingPath = specialist.data.pendingPath
      notice = specialist.data.notice
      status = mapSpecialistStatus(specialist.data.status)
    }
  } else if (
    decision.action === 'log_empty' ||
    decision.action === 'notice_empty'
  ) {
    status = 'ok'
  }

  if (memory && loggedEvents && loggedEvents.length > 0) {
    for (const event of loggedEvents) {
      const written = memory.writeNote({
        threadId,
        text: `logged ${event.eventTypeId} vessel=${event.vesselId ?? '-'} slip=${event.slipId ?? '-'}`,
        attribution: 'self',
      })
      if (written) {
        pushStep(steps, {
          type: 'memory',
          agent: 'scribe',
          summary: 'note_written',
          result: { noteId: written.id },
        })
      }
    }
  }

  const finished = now()
  const trace: TraceRun = {
    operationId,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    status,
    steps,
  }

  let tracePath: string | undefined
  const shouldPersist =
    input.persistTrace === true ||
    (input.persistTrace !== false && Boolean(input.varRootDir))

  if (shouldPersist && input.varRootDir) {
    tracePath = writeTraceJson(trace, input.varRootDir).path
  }

  return ok({
    operationId,
    decision,
    shouldContinue,
    loggedEvents,
    clarificationQuestion,
    pendingPath,
    notice,
    trace,
    tracePath,
    traceSummary: formatTraceSummary(trace),
  })
}

function mapSpecialistStatus(
  status:
    | 'ok'
    | 'ignored'
    | 'needs_clarification'
    | 'needs_approval'
    | 'failed'
    | 'denied'
    | 'max_steps',
): TraceRunStatus {
  switch (status) {
    case 'needs_clarification':
      return 'needs_clarification'
    case 'needs_approval':
      return 'needs_approval'
    case 'failed':
    case 'denied':
    case 'max_steps':
      return 'failed'
    case 'ignored':
    case 'ok':
      return 'ok'
  }
}

async function runLogPath(args: {
  input: RunInput
  decision: Extract<InboundDecision, { action: 'log' }>
  operationId: string
  catalog: HarborCatalog
  steps: TraceStep[]
  now: () => Date
}): Promise<{
  status: TraceRunStatus
  loggedEvents?: LoggedEvent[]
  clarificationQuestion?: string
}> {
  const { input, decision, operationId, catalog, steps, now } = args
  if (!input.llm) {
    pushStep(steps, {
      type: 'error',
      agent: 'system',
      summary: 'llm_port_missing',
      result: { message: 'llm is required for /log' },
    })
    return { status: 'failed' }
  }

  const store = input.eventStore ?? createMemoryEventStore()
  const handled = await handleLog({
    remainder: decision.remainder,
    operationId,
    catalog,
    llm: input.llm,
    store,
    createEventId: input.createEventId,
    now,
  })

  if (handled.error) {
    pushStep(steps, {
      type: 'error',
      agent: 'system',
      summary: 'handle_log_failed',
      result: handled.error,
    })
    return { status: 'failed' }
  }

  for (const step of handled.data.steps) {
    steps.push({ ...step, index: steps.length })
  }

  if (handled.data.status === 'needs_clarification') {
    return {
      status: 'needs_clarification',
      clarificationQuestion: handled.data.clarificationQuestion,
    }
  }
  if (handled.data.status === 'failed') {
    return { status: 'failed', loggedEvents: handled.data.events }
  }
  return { status: 'ok', loggedEvents: handled.data.events }
}

async function runNoticeCommand(args: {
  input: RunInput
  remainder: string
  operationId: string
  catalog: HarborCatalog
  hitl: HitlPort
  steps: TraceStep[]
  now: () => Date
}): Promise<{
  status: TraceRunStatus
  pendingPath?: string
  notice?: NoticeDraft
}> {
  const { remainder, operationId, catalog, hitl, steps, now } = args

  const specialist = await runSpecialistPath({
    text: remainder,
    operationId,
    catalog,
    hitl,
    maxSteps: args.input.maxSteps,
    priorSteps: steps,
    now,
    classifyOverride: { label: 'notice', specialist: 'clerk' },
  })

  if (specialist.error) {
    pushStep(steps, {
      type: 'error',
      agent: 'system',
      summary: 'notice_path_failed',
      result: specialist.error,
    })
    return { status: 'failed' }
  }

  steps.length = 0
  steps.push(...specialist.data.steps)

  return {
    status: mapSpecialistStatus(specialist.data.status),
    pendingPath: specialist.data.pendingPath,
    notice: specialist.data.notice,
  }
}

function summaryFor(decision: InboundDecision): string {
  switch (decision.action) {
    case 'skip':
      return `skip:${decision.reason}`
    case 'log':
      return 'log'
    case 'log_empty':
      return 'log_empty'
    case 'notice':
      return 'notice'
    case 'notice_empty':
      return 'notice_empty'
    case 'continue':
      return 'continue'
  }
}

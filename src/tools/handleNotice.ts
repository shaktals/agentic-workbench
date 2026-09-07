import { critiqueClaim } from '#agents/critic.ts'
import type { HarborCatalog } from '#domain/catalog.ts'
import type { HitlPort, NoticeDraft } from '#hitl/port.ts'
import { ok, type Result } from '#result.ts'
import type { TraceStep } from '#tracing/types.ts'

import { matchVesselOrSlipSync } from './catalogTools.ts'
import { isToolOk } from './invokeTool.ts'
import { draftNotice, sendNotice } from './noticeTools.ts'

export type HandleNoticeInput = {
  remainder: string
  operationId: string
  catalog: HarborCatalog
  hitl: HitlPort
  /** Optional pre-built body (clerk may draft from LLM later). */
  body?: string
  subject?: string
  now?: () => Date
  /**
   * When true, skip critic (tests only). Default runs critic before send.
   */
  skipCritic?: boolean
}

export type HandleNoticeOutput = {
  status: 'needs_approval' | 'sent' | 'failed' | 'denied'
  draft?: NoticeDraft
  pendingPath?: string
  steps: TraceStep[]
  errorMessage?: string
  criticFlags?: unknown
}

function pushStep(steps: TraceStep[], step: Omit<TraceStep, 'index'>): void {
  steps.push({ ...step, index: steps.length })
}

function inferIds(
  text: string,
  catalog: HarborCatalog,
): { vesselId?: string; slipId?: string } {
  let vesselId: string | undefined
  let slipId: string | undefined

  for (const v of catalog.vessels) {
    if (
      text.toLowerCase().includes(v.name.toLowerCase()) ||
      text.toLowerCase().includes(v.registration.toLowerCase())
    ) {
      vesselId = v.id
      break
    }
  }
  for (const s of catalog.slips) {
    if (
      text.toLowerCase().includes(s.code.toLowerCase()) ||
      text.toLowerCase().includes(s.name.toLowerCase())
    ) {
      slipId = s.id
      break
    }
  }

  // Try match helper for leftover tokens like "Aurora"
  if (!vesselId) {
    const words = text.split(/\s+/).filter(w => w.length > 2)
    for (const w of words) {
      const m = matchVesselOrSlipSync(catalog, { entity: 'vessel', query: w })
      if (m.kind === 'match') {
        vesselId = m.id
        break
      }
    }
  }

  return { vesselId, slipId }
}

/**
 * Clerk path: draft_notice → critic → send_notice (HITL park by default).
 */
export async function handleNotice(
  input: HandleNoticeInput,
): Promise<Result<HandleNoticeOutput>> {
  const steps: TraceStep[] = []
  const body = (input.body ?? input.remainder).trim()
  const ids = inferIds(body, input.catalog)

  const drafted = await draftNotice({
    operationId: input.operationId,
    sourceText: input.remainder,
    subject: input.subject,
    body,
    vesselId: ids.vesselId,
    slipId: ids.slipId,
    now: input.now,
  })

  pushStep(steps, {
    type: 'tool',
    agent: 'clerk',
    tool: 'draft_notice',
    summary: isToolOk(drafted) ? 'draft_ok' : 'draft_failed',
    args: { bodyPreview: body.slice(0, 120) },
    result: isToolOk(drafted)
      ? { subject: drafted.data.subject }
      : drafted.error,
    latencyMs: drafted.meta.latencyMs,
  })

  if (!isToolOk(drafted)) {
    return ok({
      status: 'failed',
      steps,
      errorMessage: drafted.error.message,
    })
  }

  if (!input.skipCritic) {
    const critique = critiqueClaim({
      sourceText: input.remainder,
      catalog: input.catalog,
      claim: {
        body: drafted.data.body,
        vesselId: drafted.data.vesselId,
        slipId: drafted.data.slipId,
      },
    })

    pushStep(steps, {
      type: 'critic',
      agent: 'critic',
      summary: critique.ok ? 'claim_ok' : 'claim_rejected',
      args: {
        vesselId: drafted.data.vesselId,
        slipId: drafted.data.slipId,
      },
      result: critique,
    })

    if (!critique.ok) {
      return ok({
        status: 'failed',
        draft: drafted.data,
        steps,
        criticFlags: critique.flags,
        errorMessage: critique.flags.map(f => f.message).join('; '),
      })
    }
  }

  const sent = await sendNotice({
    draft: drafted.data,
    hitl: input.hitl,
  })

  pushStep(steps, {
    type: 'hitl',
    agent: 'clerk',
    tool: 'send_notice',
    summary: isToolOk(sent) ? sent.data.outcome : 'send_failed',
    args: { operationId: input.operationId },
    result: isToolOk(sent) ? sent.data : sent.error,
    latencyMs: sent.meta.latencyMs,
  })

  if (!isToolOk(sent)) {
    return ok({
      status: 'failed',
      draft: drafted.data,
      steps,
      errorMessage: sent.error.message,
    })
  }

  if (sent.data.outcome === 'parked') {
    return ok({
      status: 'needs_approval',
      draft: drafted.data,
      pendingPath: sent.data.pendingPath,
      steps,
    })
  }

  if (sent.data.outcome === 'denied') {
    return ok({
      status: 'denied',
      draft: drafted.data,
      steps,
      errorMessage: sent.data.reason,
    })
  }

  return ok({
    status: 'sent',
    draft: drafted.data,
    steps,
  })
}

import type { HitlPort, NoticeDraft } from '#hitl/port.ts'
import { err, ok } from '#result.ts'

import { invokeTool, type ToolResult } from './invokeTool.ts'

export type DraftNoticeInput = {
  operationId: string
  sourceText: string
  subject?: string
  body: string
  vesselId?: string
  slipId?: string
  audience?: NoticeDraft['audience']
  now?: () => Date
}

/** Build a notice draft (not sent). */
export async function draftNotice(
  input: DraftNoticeInput,
): Promise<ToolResult<NoticeDraft>> {
  return invokeTool({
    name: 'draft_notice',
    fn: async () => {
      const body = input.body.trim()
      if (!body) {
        return err({
          code: 'TOOL_INVALID_ARGS',
          message: 'Notice body is required.',
        })
      }
      const now = input.now ?? (() => new Date())
      const draft: NoticeDraft = {
        operationId: input.operationId,
        subject: input.subject?.trim() || 'Harbor desk notice',
        body,
        vesselId: input.vesselId,
        slipId: input.slipId,
        audience: input.audience ?? 'broadcast',
        createdAt: now().toISOString(),
      }
      return ok(draft)
    },
  })
}

export type SendNoticeResult =
  | { outcome: 'parked'; pendingPath: string; draft: NoticeDraft }
  | { outcome: 'sent'; draft: NoticeDraft }
  | { outcome: 'denied'; reason: string; draft: NoticeDraft }

/** Risky tool: park for human approval by default (HitlPort). */
export async function sendNotice(input: {
  draft: NoticeDraft
  hitl: HitlPort
}): Promise<ToolResult<SendNoticeResult>> {
  return invokeTool<SendNoticeResult>({
    name: 'send_notice',
    fn: async () => {
      const decision = await input.hitl.requestSend(input.draft)
      if (decision.status === 'pending') {
        const parked: SendNoticeResult = {
          outcome: 'parked',
          pendingPath: decision.pendingPath,
          draft: input.draft,
        }
        return ok(parked)
      }
      if (decision.status === 'denied') {
        const denied: SendNoticeResult = {
          outcome: 'denied',
          reason: decision.reason,
          draft: input.draft,
        }
        return ok(denied)
      }
      const sent: SendNoticeResult = {
        outcome: 'sent',
        draft: input.draft,
      }
      return ok(sent)
    },
  })
}

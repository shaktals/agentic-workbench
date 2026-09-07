/**
 * Deterministic inbound policy: the graph owns whether we act.
 * LLM agency starts only after `continue` (later PRs).
 */

import { parseLogCommand, parseNoticeCommand } from './parseCommands.ts'
import type {
  EvaluateInboundEnv,
  InboundDecision,
  InboundMessage,
} from './types.ts'

const DEFAULT_ADDRESS_HINTS = ['desk', '@harbor'] as const

function isPier(channel: InboundMessage['channel']): boolean {
  return channel === 'pier'
}

/** True when the pier message addresses the desk (reply or name hint). */
export function isAddressedOnPier(
  inbound: InboundMessage,
  env: EvaluateInboundEnv = {},
): boolean {
  if (inbound.replyToDesk === true) return true

  const hints = env.addressHints ?? [...DEFAULT_ADDRESS_HINTS]
  const lower = inbound.body.toLowerCase()

  for (const raw of hints) {
    const sub = raw.trim().toLowerCase()
    if (sub.length > 0 && lower.includes(sub)) return true
  }

  return false
}

/**
 * Pure policy machine. Commands win over free-text; pier traffic is ignored
 * unless addressed (same contract as production group gating).
 */
export function evaluateInbound(
  inbound: InboundMessage,
  env: EvaluateInboundEnv = {},
): InboundDecision {
  const log = parseLogCommand(inbound.body)
  if (log.kind === 'payload') {
    return { action: 'log', remainder: log.remainder }
  }
  if (log.kind === 'empty') {
    return { action: 'log_empty' }
  }

  const notice = parseNoticeCommand(inbound.body)
  if (notice.kind === 'payload') {
    return { action: 'notice', remainder: notice.remainder }
  }
  if (notice.kind === 'empty') {
    return { action: 'notice_empty' }
  }

  if (isPier(inbound.channel) && !isAddressedOnPier(inbound, env)) {
    return { action: 'skip', reason: 'pier_not_addressed' }
  }

  return { action: 'continue' }
}

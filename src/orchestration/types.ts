/** Inbound message + policy decision types for the harbor desk loop. */

export type HarborChannel = 'pier' | 'radio'

/**
 * One inbound utterance after ingest (facts only — policy lives in evaluateInbound).
 * `pier` ≈ group channel (act only when addressed). `radio` ≈ private DM (always act).
 */
export type InboundMessage = {
  id: string
  channel: HarborChannel
  body: string
  /** True when this message is a reply to a prior desk message. */
  replyToDesk?: boolean
}

export type InboundDecision =
  | { action: 'skip'; reason: string }
  | { action: 'log'; remainder: string }
  | { action: 'log_empty' }
  | { action: 'notice'; remainder: string }
  | { action: 'notice_empty' }
  /** Hand off to classifier / specialists (wired in later PRs). */
  | { action: 'continue' }

export type EvaluateInboundEnv = {
  /**
   * Plain-text substrings that mean the desk was called on a pier
   * (case-insensitive). Defaults: `desk`, `@harbor`.
   */
  addressHints?: string[]
}

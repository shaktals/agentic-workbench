import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type NoticeDraft = {
  operationId: string
  subject: string
  body: string
  vesselId?: string
  slipId?: string
  audience: 'pier' | 'radio' | 'broadcast'
  createdAt: string
}

export type PendingNotice = NoticeDraft & {
  status: 'pending'
}

export type OutboundNotice = NoticeDraft & {
  status: 'sent'
  approvedAt: string
}

export type HitlDecision =
  | { status: 'pending'; pendingPath: string }
  | { status: 'approved' }
  | { status: 'denied'; reason: string }

/**
 * Human-in-the-loop port for risky outbound sends.
 * Default file port parks; tests inject approve/deny/pending.
 */
export type HitlPort = {
  requestSend(notice: NoticeDraft): Promise<HitlDecision>
}

export type FileHitlOptions = {
  rootDir: string
  /** When true, auto-approve (demo --yes escape hatch). */
  autoApprove?: boolean
}

export function pendingPathFor(rootDir: string, operationId: string): string {
  return join(rootDir, 'pending', `${operationId}.json`)
}

export function outboundPathFor(rootDir: string, operationId: string): string {
  return join(rootDir, 'outbound', `${operationId}.json`)
}

export function createFileHitlPort(options: FileHitlOptions): HitlPort {
  const pendingDir = join(options.rootDir, 'pending')
  const outboundDir = join(options.rootDir, 'outbound')

  return {
    async requestSend(notice) {
      if (options.autoApprove) {
        mkdirSync(outboundDir, { recursive: true })
        const sent: OutboundNotice = {
          ...notice,
          status: 'sent',
          approvedAt: new Date().toISOString(),
        }
        writeFileSync(
          outboundPathFor(options.rootDir, notice.operationId),
          `${JSON.stringify(sent, null, 2)}\n`,
          'utf8',
        )
        return { status: 'approved' }
      }

      mkdirSync(pendingDir, { recursive: true })
      const pending: PendingNotice = { ...notice, status: 'pending' }
      const path = pendingPathFor(options.rootDir, notice.operationId)
      writeFileSync(path, `${JSON.stringify(pending, null, 2)}\n`, 'utf8')
      return { status: 'pending', pendingPath: path }
    },
  }
}

export function createMemoryHitlPort(
  mode: 'pending' | 'approved' | 'denied' = 'pending',
): HitlPort {
  return {
    async requestSend() {
      if (mode === 'approved') return { status: 'approved' }
      if (mode === 'denied') {
        return { status: 'denied', reason: 'test_denied' }
      }
      return { status: 'pending', pendingPath: ':memory:' }
    },
  }
}

/** Move a pending notice to outbound (approve CLI). */
export function approvePendingNotice(input: {
  rootDir: string
  operationId: string
  now?: () => Date
}): { ok: true; outboundPath: string } | { ok: false; message: string } {
  const pendingPath = pendingPathFor(input.rootDir, input.operationId)
  let raw: string
  try {
    raw = readFileSync(pendingPath, 'utf8')
  } catch {
    return { ok: false, message: `No pending notice at ${pendingPath}` }
  }

  let parsed: PendingNotice
  try {
    parsed = JSON.parse(raw) as PendingNotice
  } catch {
    return { ok: false, message: 'Pending notice JSON is invalid.' }
  }

  const now = input.now ?? (() => new Date())
  const sent: OutboundNotice = {
    operationId: parsed.operationId,
    subject: parsed.subject,
    body: parsed.body,
    vesselId: parsed.vesselId,
    slipId: parsed.slipId,
    audience: parsed.audience,
    createdAt: parsed.createdAt,
    status: 'sent',
    approvedAt: now().toISOString(),
  }

  const outPath = outboundPathFor(input.rootDir, input.operationId)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(sent, null, 2)}\n`, 'utf8')

  try {
    unlinkSync(pendingPath)
  } catch {
    // outbound already written
  }

  return { ok: true, outboundPath: outPath }
}

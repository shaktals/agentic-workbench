/**
 * Parse harbor slash commands from inbound body text.
 * Policy (when to act) lives in evaluateInbound — this module only parses.
 */

export type LogCommandParse =
  { kind: 'none' } | { kind: 'empty' } | { kind: 'payload'; remainder: string }

export type NoticeCommandParse =
  { kind: 'none' } | { kind: 'empty' } | { kind: 'payload'; remainder: string }

const LOG_SLASH = new Set(['log'])
const NOTICE_SLASH = new Set(['notice'])

const LOG_ALIAS = 'log:'
const NOTICE_ALIAS = 'notice:'

function remainderAfterAlias(body: string, alias: string): string | null {
  const lower = body.toLowerCase()
  const idx = lower.indexOf(alias.toLowerCase())
  if (idx < 0) return null
  return body.slice(idx + alias.length).trim()
}

function parseSlashCommand(
  body: string,
  commands: Set<string>,
): { matched: true; remainder: string } | { matched: false } {
  const trimmed = body.trim()
  if (!trimmed.startsWith('/')) return { matched: false }

  const withoutSlash = trimmed.slice(1)
  const space = withoutSlash.search(/\s/)
  const name = (space < 0 ? withoutSlash : withoutSlash.slice(0, space))
    .trim()
    .toLowerCase()
  const remainder = space < 0 ? '' : withoutSlash.slice(space).trim()

  if (!commands.has(name)) return { matched: false }
  return { matched: true, remainder }
}

function fromSlashOrAlias(
  body: string,
  commands: Set<string>,
  alias: string,
): LogCommandParse {
  const slash = parseSlashCommand(body, commands)
  if (slash.matched) {
    return slash.remainder.length > 0
      ? { kind: 'payload', remainder: slash.remainder }
      : { kind: 'empty' }
  }

  const rem = remainderAfterAlias(body, alias)
  if (rem === null) return { kind: 'none' }

  return rem.length > 0
    ? { kind: 'payload', remainder: rem }
    : { kind: 'empty' }
}

/** `/log …` or `log:` alias. */
export function parseLogCommand(body: string): LogCommandParse {
  return fromSlashOrAlias(body, LOG_SLASH, LOG_ALIAS)
}

/** `/notice …` or `notice:` alias. */
export function parseNoticeCommand(body: string): NoticeCommandParse {
  return fromSlashOrAlias(body, NOTICE_SLASH, NOTICE_ALIAS)
}

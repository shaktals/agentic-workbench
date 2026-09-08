/**
 * Thread scratchpad + long-term notes with a write/retrieve policy.
 * `attribution: 'other'` is excluded from self context (prod memory pattern).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type MemoryAttribution = 'self' | 'other'

export type MemoryNote = {
  id: string
  threadId: string
  text: string
  attribution: MemoryAttribution
  /** Required when attribution is `other`. */
  otherName?: string
  createdAt: string
  /** Optional dedupe key (skip write when unchanged). */
  contentHash?: string
}

export type Scratchpad = {
  threadId: string
  lines: string[]
}

export type MemoryStoreFile = {
  notes: MemoryNote[]
}

export type MemoryPort = {
  appendScratch(threadId: string, line: string): void
  readScratch(threadId: string): Scratchpad
  writeNote(
    note: Omit<MemoryNote, 'id' | 'createdAt'> & {
      id?: string
      createdAt?: string
    },
  ): MemoryNote | null
  /** Notes eligible for *self* model context. */
  retrieveForSelfContext(threadId: string, limit?: number): MemoryNote[]
  listNotes(threadId?: string): MemoryNote[]
}

function hashText(text: string): string {
  // Tiny stable hash — enough for dedupe, not crypto.
  let h = 0
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) | 0
  }
  return `h${Math.abs(h)}`
}

/** True when a note must be excluded from the subject's own context. */
export function excludeFromSelfContext(note: MemoryNote): boolean {
  return note.attribution === 'other'
}

export function createMemoryPort(options?: {
  filePath?: string
  createId?: () => string
  now?: () => Date
}): MemoryPort {
  const createId = options?.createId ?? (() => crypto.randomUUID())
  const now = options?.now ?? (() => new Date())
  const scratch = new Map<string, string[]>()
  let notes: MemoryNote[] = []

  if (options?.filePath) {
    try {
      const raw = JSON.parse(
        readFileSync(options.filePath, 'utf8'),
      ) as MemoryStoreFile
      if (Array.isArray(raw.notes)) notes = raw.notes
    } catch {
      notes = []
    }
  }

  function persist() {
    if (!options?.filePath) return
    mkdirSync(dirname(options.filePath), { recursive: true })
    const body: MemoryStoreFile = { notes }
    writeFileSync(
      options.filePath,
      `${JSON.stringify(body, null, 2)}\n`,
      'utf8',
    )
  }

  return {
    appendScratch(threadId, line) {
      const trimmed = line.trim()
      if (!trimmed) return
      const rows = scratch.get(threadId) ?? []
      rows.push(trimmed)
      scratch.set(threadId, rows)
    },

    readScratch(threadId) {
      return { threadId, lines: [...(scratch.get(threadId) ?? [])] }
    },

    writeNote(input) {
      const text = input.text.trim()
      if (!text) return null
      if (input.attribution === 'other' && !input.otherName?.trim()) {
        return null
      }

      const contentHash = input.contentHash ?? hashText(text)
      const existing = notes.find(
        n =>
          n.threadId === input.threadId &&
          n.contentHash === contentHash &&
          n.attribution === input.attribution,
      )
      if (existing) return null

      const note: MemoryNote = {
        id: input.id ?? createId(),
        threadId: input.threadId,
        text,
        attribution: input.attribution,
        otherName: input.otherName?.trim(),
        createdAt: input.createdAt ?? now().toISOString(),
        contentHash,
      }
      notes.push(note)
      persist()
      return note
    },

    retrieveForSelfContext(threadId, limit = 20) {
      return notes
        .filter(n => n.threadId === threadId && !excludeFromSelfContext(n))
        .slice(-limit)
    },

    listNotes(threadId) {
      if (!threadId) return [...notes]
      return notes.filter(n => n.threadId === threadId)
    },
  }
}

export function defaultMemoryFilePath(rootDir = 'var'): string {
  return join(rootDir, 'memory.json')
}

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { createMemoryPort, excludeFromSelfContext } from '#memory/store.ts'

describe('memory policy', () => {
  it('excludes attribution other from self context', () => {
    const mem = createMemoryPort({
      createId: () => 'n1',
      now: () => new Date('2026-09-07T18:00:00.000Z'),
    })

    mem.writeNote({
      threadId: 't1',
      text: 'own note',
      attribution: 'self',
      id: 'self1',
    })
    mem.writeNote({
      threadId: 't1',
      text: 'heard from skipper',
      attribution: 'other',
      otherName: 'Skipper Ana',
      id: 'other1',
    })

    const selfCtx = mem.retrieveForSelfContext('t1')
    assert.equal(selfCtx.length, 1)
    assert.equal(selfCtx[0]?.id, 'self1')
    assert.equal(
      excludeFromSelfContext(mem.listNotes('t1').find(n => n.id === 'other1')!),
      true,
    )
  })

  it('skips duplicate writes by content hash', () => {
    const mem = createMemoryPort({ createId: () => 'dup' })
    const first = mem.writeNote({
      threadId: 't1',
      text: 'same text',
      attribution: 'self',
    })
    const second = mem.writeNote({
      threadId: 't1',
      text: 'same text',
      attribution: 'self',
    })
    assert.ok(first)
    assert.equal(second, null)
    assert.equal(mem.listNotes('t1').length, 1)
  })

  it('persists to memory.json when a file path is set', () => {
    const root = mkdtempSync(join(tmpdir(), 'aw-mem-'))
    try {
      const filePath = join(root, 'memory.json')
      const mem = createMemoryPort({
        filePath,
        createId: () => 'p1',
        now: () => new Date('2026-09-07T18:00:00.000Z'),
      })
      mem.writeNote({
        threadId: 't1',
        text: 'persisted',
        attribution: 'self',
      })
      const raw = JSON.parse(readFileSync(filePath, 'utf8')) as {
        notes: { text: string }[]
      }
      assert.equal(raw.notes[0]?.text, 'persisted')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

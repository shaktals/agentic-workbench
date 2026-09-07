import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  approvePendingNotice,
  createFileHitlPort,
  pendingPathFor,
} from '#hitl/port.ts'
import { handleNotice } from '#tools/handleNotice.ts'
import { loadHarborCatalog } from '#domain/catalog.ts'

const catalog = loadHarborCatalog()

describe('handleNotice + HITL', () => {
  it('parks send_notice and does not write outbound', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aw-hitl-'))
    try {
      const hitl = createFileHitlPort({ rootDir: root })
      const result = await handleNotice({
        remainder: 'gale warning for outer basin near slip C3',
        operationId: 'op_park',
        catalog,
        hitl,
        body: 'Gale warning for outer basin near slip C3',
        now: () => new Date('2026-09-07T15:00:00.000Z'),
      })

      assert.equal(result.data?.status, 'needs_approval')
      assert.ok(result.data?.pendingPath)
      assert.equal(
        readFileSync(pendingPathFor(root, 'op_park'), 'utf8').includes(
          'pending',
        ),
        true,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('critic blocks invented claims before send', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aw-hitl-deny-'))
    try {
      const hitl = createFileHitlPort({ rootDir: root })
      const result = await handleNotice({
        remainder: 'weather looks rough',
        operationId: 'op_bad',
        catalog,
        hitl,
        body: 'Meridian must vacate slip B2 within 12 hours',
      })

      assert.equal(result.data?.status, 'failed')
      assert.ok(result.data?.criticFlags)
      assert.ok(result.data?.steps.some(s => s.summary === 'claim_rejected'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('approvePendingNotice moves pending to outbound', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aw-hitl-approve-'))
    try {
      const hitl = createFileHitlPort({ rootDir: root })
      await handleNotice({
        remainder: 'gale warning for outer basin near slip C3',
        operationId: 'op_ok',
        catalog,
        hitl,
        body: 'Gale warning for outer basin near slip C3',
      })

      const approved = approvePendingNotice({
        rootDir: root,
        operationId: 'op_ok',
      })
      assert.equal(approved.ok, true)
      if (approved.ok) {
        assert.match(approved.outboundPath, /outbound/)
        assert.equal(
          readFileSync(approved.outboundPath, 'utf8').includes('"sent"'),
          true,
        )
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

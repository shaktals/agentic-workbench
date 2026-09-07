import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseLogCommand,
  parseNoticeCommand,
} from '#orchestration/parseCommands.ts'

describe('parseLogCommand', () => {
  it('parses /log with remainder', () => {
    assert.deepEqual(parseLogCommand('/log fuel 40 L on slip A3'), {
      kind: 'payload',
      remainder: 'fuel 40 L on slip A3',
    })
  })

  it('parses log: alias', () => {
    assert.deepEqual(parseLogCommand('log: pump-out complete'), {
      kind: 'payload',
      remainder: 'pump-out complete',
    })
  })

  it('returns empty for bare /log', () => {
    assert.deepEqual(parseLogCommand('/log'), { kind: 'empty' })
    assert.deepEqual(parseLogCommand('/log   '), { kind: 'empty' })
  })

  it('returns none when absent', () => {
    assert.deepEqual(parseLogCommand('fuel truck on pier'), { kind: 'none' })
  })
})

describe('parseNoticeCommand', () => {
  it('parses /notice with remainder', () => {
    assert.deepEqual(parseNoticeCommand('/notice hold berth B2 for Meridian'), {
      kind: 'payload',
      remainder: 'hold berth B2 for Meridian',
    })
  })

  it('parses notice: alias', () => {
    assert.deepEqual(parseNoticeCommand('notice: weather advisory gale'), {
      kind: 'payload',
      remainder: 'weather advisory gale',
    })
  })

  it('returns empty for bare /notice', () => {
    assert.deepEqual(parseNoticeCommand('/notice'), { kind: 'empty' })
  })

  it('returns none when absent', () => {
    assert.deepEqual(parseNoticeCommand('hello desk'), { kind: 'none' })
  })
})

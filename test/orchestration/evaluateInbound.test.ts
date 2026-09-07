import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  evaluateInbound,
  isAddressedOnPier,
} from '#orchestration/evaluateInbound.ts'
import type { InboundMessage } from '#orchestration/types.ts'

function msg(
  partial: Pick<InboundMessage, 'channel' | 'body'> &
    Partial<Omit<InboundMessage, 'channel' | 'body'>>,
): InboundMessage {
  return {
    id: partial.id ?? 'msg_1',
    channel: partial.channel,
    body: partial.body,
    replyToDesk: partial.replyToDesk,
  }
}

describe('isAddressedOnPier', () => {
  it('detects desk and @harbor hints', () => {
    assert.equal(
      isAddressedOnPier(msg({ channel: 'pier', body: 'hey desk, status?' })),
      true,
    )
    assert.equal(
      isAddressedOnPier(msg({ channel: 'pier', body: '@harbor fuel truck' })),
      true,
    )
  })

  it('detects replyToDesk', () => {
    assert.equal(
      isAddressedOnPier(
        msg({ channel: 'pier', body: 'yes', replyToDesk: true }),
      ),
      true,
    )
  })

  it('returns false when not addressed', () => {
    assert.equal(
      isAddressedOnPier(msg({ channel: 'pier', body: 'nice sunset tonight' })),
      false,
    )
  })
})

describe('evaluateInbound', () => {
  it('skips pier chatter that does not address the desk', () => {
    assert.deepEqual(
      evaluateInbound(
        msg({ channel: 'pier', body: 'anyone seen the fuel truck?' }),
      ),
      { action: 'skip', reason: 'pier_not_addressed' },
    )
  })

  it('continues on pier when addressed', () => {
    assert.deepEqual(
      evaluateInbound(
        msg({ channel: 'pier', body: 'desk — which slip for Meridian?' }),
      ),
      { action: 'continue' },
    )
  })

  it('continues on radio without address hints', () => {
    assert.deepEqual(
      evaluateInbound(
        msg({ channel: 'radio', body: 'which slip for Meridian?' }),
      ),
      { action: 'continue' },
    )
  })

  it('routes /log before pier gating', () => {
    assert.deepEqual(
      evaluateInbound(
        msg({
          channel: 'pier',
          body: '/log fuel 40 L vessel V-104',
        }),
      ),
      { action: 'log', remainder: 'fuel 40 L vessel V-104' },
    )
  })

  it('routes /notice before pier gating', () => {
    assert.deepEqual(
      evaluateInbound(
        msg({
          channel: 'pier',
          body: '/notice gale warning for outer basin',
        }),
      ),
      { action: 'notice', remainder: 'gale warning for outer basin' },
    )
  })

  it('returns empty command actions', () => {
    assert.deepEqual(evaluateInbound(msg({ channel: 'radio', body: '/log' })), {
      action: 'log_empty',
    })
    assert.deepEqual(
      evaluateInbound(msg({ channel: 'radio', body: '/notice' })),
      { action: 'notice_empty' },
    )
  })

  it('prefers /log over /notice when both appear', () => {
    assert.deepEqual(
      evaluateInbound(
        msg({
          channel: 'radio',
          body: '/log note; ignore /notice later',
        }),
      ),
      { action: 'log', remainder: 'note; ignore /notice later' },
    )
  })
})

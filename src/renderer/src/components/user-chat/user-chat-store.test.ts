import { describe, expect, it } from 'vitest'
import type { UserChatChannel } from '../../../../shared/user-chat-contract'
import { sortUserChatChannels } from './user-chat-store'

function channel(id: string, name: string, lastActivityAtMs: number): UserChatChannel {
  return {
    id,
    name,
    type: 'channel',
    visibility: 'open',
    participantPubkeys: [],
    lastActivityAtMs,
    unreadCount: 0
  }
}

describe('sortUserChatChannels', () => {
  it('orders the most recently active conversation first with stable ties', () => {
    const olderId = '11111111-1111-4111-8111-111111111111'
    const alphaId = '22222222-2222-4222-8222-222222222222'
    const betaId = '33333333-3333-4333-8333-333333333333'
    expect(
      sortUserChatChannels([
        channel(olderId, 'older', 10),
        channel(betaId, 'beta', 20),
        channel(alphaId, 'alpha', 20)
      ]).map((candidate) => candidate.id)
    ).toEqual([alphaId, betaId, olderId])
  })
})

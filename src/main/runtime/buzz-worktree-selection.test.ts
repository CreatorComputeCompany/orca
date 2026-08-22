import { describe, expect, it } from 'vitest'
import { selectBuzzWorktree } from './buzz-worktree-selection'

const matchesChannel = (worktree: { channel: string }): boolean => worktree.channel === 'chat-1'

describe('selectBuzzWorktree', () => {
  it('prefers the member-owned match without considering legacy rows', () => {
    expect(
      selectBuzzWorktree({
        worktrees: [
          { id: 'legacy', channel: 'chat-1' },
          { id: 'owned', channel: 'chat-1', ownerMemberKey: 'member-a' }
        ],
        memberKey: 'member-a',
        matchesChannel,
        allowLegacyClaim: true
      })
    ).toEqual({
      kind: 'owned',
      worktree: { id: 'owned', channel: 'chat-1', ownerMemberKey: 'member-a' }
    })
  })

  it('offers one unowned legacy match only when migration is enabled', () => {
    const worktrees = [{ id: 'legacy', channel: 'chat-1' }]
    expect(
      selectBuzzWorktree({
        worktrees,
        memberKey: 'member-a',
        matchesChannel,
        allowLegacyClaim: false
      })
    ).toEqual({ kind: 'missing' })
    expect(
      selectBuzzWorktree({
        worktrees,
        memberKey: 'member-a',
        matchesChannel,
        allowLegacyClaim: true
      })
    ).toEqual({ kind: 'legacy', worktree: worktrees[0] })
  })

  it('fails closed when more than one legacy worktree matches', () => {
    expect(() =>
      selectBuzzWorktree({
        worktrees: [
          { id: 'legacy-1', channel: 'chat-1' },
          { id: 'legacy-2', channel: 'chat-1' }
        ],
        memberKey: 'member-a',
        matchesChannel,
        allowLegacyClaim: true
      })
    ).toThrow('Multiple legacy Orca worktrees match the Buzz chat')
  })
})

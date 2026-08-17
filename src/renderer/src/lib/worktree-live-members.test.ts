import { describe, expect, it } from 'vitest'
import { selectLiveMembersForWorktree } from './worktree-live-members'

describe('worktree live members', () => {
  it('shows each member only on the worktree they are actively viewing', () => {
    const members = [
      { key: 'jake', displayName: 'Jake', worktreeId: 'worktree-a' },
      { key: 'steven', displayName: 'Steven', worktreeId: 'worktree-b' }
    ]

    expect(selectLiveMembersForWorktree(members, 'worktree-a')).toEqual([
      { key: 'jake', displayName: 'Jake' }
    ])
    expect(selectLiveMembersForWorktree(members, 'worktree-b')).toEqual([
      { key: 'steven', displayName: 'Steven' }
    ])
    expect(selectLiveMembersForWorktree(members, 'worktree-c')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import {
  resolveLiveMembersForWorktree,
  selectLiveMembersForWorktree
} from './worktree-live-members'

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

  it('prefers streamed presence over a stale worktree bootstrap snapshot', () => {
    expect(
      resolveLiveMembersForWorktree(
        [{ key: 'steven', displayName: 'Steven', worktreeId: 'worktree-a' }],
        [],
        'worktree-a'
      )
    ).toEqual([{ key: 'steven', displayName: 'Steven' }])

    expect(
      resolveLiveMembersForWorktree([], [{ key: 'steven', displayName: 'Steven' }], 'worktree-a')
    ).toEqual([])
  })

  it('uses the worktree snapshot until streamed presence is available', () => {
    expect(
      resolveLiveMembersForWorktree(undefined, [{ key: 'jake', displayName: 'Jake' }], 'worktree-a')
    ).toEqual([{ key: 'jake', displayName: 'Jake' }])
  })

  it('hides the current viewer while preserving other collaborators', () => {
    const members = [
      { key: 'steven', displayName: 'Steven', worktreeId: 'worktree-a' },
      { key: 'jake', displayName: 'Jake', worktreeId: 'worktree-a' }
    ]

    expect(resolveLiveMembersForWorktree(members, undefined, 'worktree-a', 'steven')).toEqual([
      { key: 'jake', displayName: 'Jake' }
    ])
    expect(resolveLiveMembersForWorktree(members, undefined, 'worktree-a')).toEqual([
      { key: 'steven', displayName: 'Steven' },
      { key: 'jake', displayName: 'Jake' }
    ])
  })
})

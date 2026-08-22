type BuzzWorktreeOwnership = {
  id: string
  ownerMemberKey?: string
}

export type BuzzWorktreeSelection<T> =
  | { kind: 'owned'; worktree: T }
  | { kind: 'legacy'; worktree: T }
  | { kind: 'missing' }

export function selectBuzzWorktree<T extends BuzzWorktreeOwnership>(args: {
  worktrees: T[]
  memberKey: string
  matchesChannel: (worktree: T) => boolean
  allowLegacyClaim: boolean
}): BuzzWorktreeSelection<T> {
  const owned = args.worktrees.filter(
    (worktree) => worktree.ownerMemberKey === args.memberKey && args.matchesChannel(worktree)
  )
  if (owned.length > 1) {
    throw new Error('Multiple Orca worktrees owned by this Buzz user match the chat.')
  }
  if (owned[0]) {
    return { kind: 'owned', worktree: owned[0] }
  }
  if (!args.allowLegacyClaim) {
    return { kind: 'missing' }
  }
  const legacy = args.worktrees.filter(
    (worktree) => !worktree.ownerMemberKey && args.matchesChannel(worktree)
  )
  if (legacy.length > 1) {
    throw new Error('Multiple legacy Orca worktrees match the Buzz chat; refusing to claim one.')
  }
  return legacy[0] ? { kind: 'legacy', worktree: legacy[0] } : { kind: 'missing' }
}

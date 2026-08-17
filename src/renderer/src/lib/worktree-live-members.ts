type RuntimeLiveMember = {
  key: string
  displayName: string
  worktreeId: string
}

type WorktreeLiveMember = {
  key: string
  displayName: string
}

export function selectLiveMembersForWorktree(
  members: RuntimeLiveMember[] | undefined,
  worktreeId: string
): WorktreeLiveMember[] {
  return (members ?? [])
    .filter((member) => member.worktreeId === worktreeId)
    .map(({ key, displayName }) => ({ key, displayName }))
}

export function resolveLiveMembersForWorktree(
  environmentMembers: RuntimeLiveMember[] | undefined,
  worktreeMembers: WorktreeLiveMember[] | undefined,
  worktreeId: string
): WorktreeLiveMember[] {
  // The environment catalog is the continuously updated presence authority. The worktree row is
  // only a bootstrap snapshot; an empty snapshot must not mask later streamed presence changes.
  return environmentMembers === undefined
    ? (worktreeMembers ?? [])
    : selectLiveMembersForWorktree(environmentMembers, worktreeId)
}

type RuntimeLiveMember = {
  key: string
  displayName: string
  worktreeId: string
  activeTabId?: string
  activeTabTitle?: string
  activeTabType?: 'terminal' | 'markdown' | 'file' | 'browser'
}

type WorktreeLiveMember = {
  key: string
  displayName: string
  activeTabId?: string
  activeTabTitle?: string
  activeTabType?: 'terminal' | 'markdown' | 'file' | 'browser'
}

export function selectLiveMembersForWorktree(
  members: RuntimeLiveMember[] | undefined,
  worktreeId: string
): WorktreeLiveMember[] {
  return (members ?? [])
    .filter((member) => member.worktreeId === worktreeId)
    .map(({ worktreeId: _worktreeId, ...member }) => member)
}

export function resolveLiveMembersForWorktree(
  environmentMembers: RuntimeLiveMember[] | undefined,
  worktreeMembers: WorktreeLiveMember[] | undefined,
  worktreeId: string,
  hiddenMemberKey?: string
): WorktreeLiveMember[] {
  // The environment catalog is the continuously updated presence authority. The worktree row is
  // only a bootstrap snapshot; an empty snapshot must not mask later streamed presence changes.
  const members =
    environmentMembers === undefined
      ? (worktreeMembers ?? [])
      : selectLiveMembersForWorktree(environmentMembers, worktreeId)
  return hiddenMemberKey ? members.filter((member) => member.key !== hiddenMemberKey) : members
}

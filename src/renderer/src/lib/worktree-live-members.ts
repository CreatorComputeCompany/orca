type RuntimeLiveMember = {
  key: string
  displayName: string
  worktreeId: string
}

export function selectLiveMembersForWorktree(
  members: RuntimeLiveMember[] | undefined,
  worktreeId: string
): { key: string; displayName: string }[] {
  return (members ?? [])
    .filter((member) => member.worktreeId === worktreeId)
    .map(({ key, displayName }) => ({ key, displayName }))
}

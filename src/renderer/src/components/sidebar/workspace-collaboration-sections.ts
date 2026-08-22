import type { Worktree } from '../../../../shared/worktree/types'

export type WorkspaceCollaborationSection = 'mine' | 'teammate' | 'shared'

export function getWorkspaceCollaborationSection(
  worktree: Worktree,
  currentDeviceIds: ReadonlySet<string>,
  currentMemberKeys: ReadonlySet<string> = new Set()
): WorkspaceCollaborationSection | null {
  if (worktree.ephemeralVmSharing === 'shared') {
    return 'shared'
  }
  if (worktree.ephemeralVmSharing !== 'private') {
    return null
  }
  if (worktree.ownerMemberKey) {
    return currentMemberKeys.has(worktree.ownerMemberKey) ? 'mine' : 'teammate'
  }
  const creator = worktree.creatorProvenance
  if (!creator) {
    return null
  }
  if (creator.kind === 'host' || currentDeviceIds.has(creator.deviceId)) {
    return 'mine'
  }
  return 'teammate'
}

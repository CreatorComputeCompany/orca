import { MULTIPLAYER_GROUP_KEY, PINNED_GROUP_KEY } from '../worktree-list-groups'
import type { HostSectionRow } from '../host-section-rows'

export type WorktreeItemRow = Extract<HostSectionRow, { type: 'item' }>
export type FolderWorkspaceItemRow = Extract<HostSectionRow, { type: 'folder-workspace' }>

export function isWorktreeItemRow(row: HostSectionRow): row is WorktreeItemRow {
  return row.type === 'item'
}

export function isPinnedWorktreeRow(row: WorktreeItemRow): boolean {
  return row.sectionKey === PINNED_GROUP_KEY
}

export function isMultiplayerWorktreeRow(row: WorktreeItemRow): boolean {
  return row.sectionKey === MULTIPLAYER_GROUP_KEY
}

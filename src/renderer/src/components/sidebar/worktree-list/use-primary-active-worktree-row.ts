import { useCallback, useLayoutEffect, useState } from 'react'
import type { ActiveSurfaceVariant } from '../WorktreeCard'
import type { HostSectionRow } from '../host-section-rows'
import type { PinnedWorktreeDisplayPolicy } from '../worktree-list-groups'
import {
  isMultiplayerWorktreeRow,
  isPinnedWorktreeRow,
  type WorktreeItemRow
} from './render-row-item-rows'

// A worktree can render in more than one section; the row the user actually clicked owns
// the primary active surface so its duplicates stay visually secondary.
export function usePrimaryActiveWorktreeRow(args: {
  rows: HostSectionRow[]
  activeWorktreeId: string | null
  pinnedDisplayPolicy: PinnedWorktreeDisplayPolicy
  onImmediateWorktreeActivate: (worktreeId: string, rowKey: string | undefined) => void
}) {
  const { rows, activeWorktreeId, pinnedDisplayPolicy, onImmediateWorktreeActivate } = args
  const [primaryActiveWorktreeRow, setPrimaryActiveWorktreeRow] = useState<{
    worktreeId: string
    rowKey: string
  } | null>(null)

  useLayoutEffect(() => {
    if (activeWorktreeId === null) {
      setPrimaryActiveWorktreeRow(null)
      return
    }
    setPrimaryActiveWorktreeRow((current) => {
      if (current === null || current.worktreeId !== activeWorktreeId) {
        return null
      }
      const rowStillVisible = rows.some(
        (row) =>
          row.type === 'item' &&
          row.worktree.id === current.worktreeId &&
          row.rowKey === current.rowKey
      )
      return rowStillVisible ? current : null
    })
  }, [activeWorktreeId, rows])

  const getActiveSurfaceVariant = useCallback(
    (row: WorktreeItemRow): ActiveSurfaceVariant => {
      if (primaryActiveWorktreeRow?.worktreeId === row.worktree.id) {
        return primaryActiveWorktreeRow.rowKey === row.rowKey ? 'primary' : 'secondary'
      }
      if (
        activeWorktreeId === row.worktree.id &&
        ((isMultiplayerWorktreeRow(row) &&
          rows.some(
            (candidate) =>
              candidate.type === 'item' &&
              candidate.worktree.id === row.worktree.id &&
              !isMultiplayerWorktreeRow(candidate)
          )) ||
          (pinnedDisplayPolicy === 'duplicate-in-groups' && isPinnedWorktreeRow(row)))
      ) {
        return 'secondary'
      }
      return 'primary'
    },
    [activeWorktreeId, pinnedDisplayPolicy, primaryActiveWorktreeRow, rows]
  )

  const handleImmediateWorktreeRowActivate = useCallback(
    (worktreeId: string, rowKey: string | undefined): void => {
      setPrimaryActiveWorktreeRow(rowKey ? { worktreeId, rowKey } : null)
      onImmediateWorktreeActivate(worktreeId, rowKey)
    },
    [onImmediateWorktreeActivate]
  )

  return {
    primaryActiveWorktreeRow,
    getActiveSurfaceVariant,
    handleImmediateWorktreeRowActivate
  }
}

import { useState } from 'react'
import { LockKeyhole, Users } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { toRuntimeExecutionHostId } from '../../../../shared/execution-host'
import type { Worktree } from '../../../../shared/worktree/types'

export function EphemeralVmSharingMenuItem({
  worktree,
  disabled
}: {
  worktree: Worktree
  disabled: boolean
}) {
  const [pending, setPending] = useState(false)
  const environment = useAppStore((state) =>
    state.runtimeEnvironments?.find((entry) => entry.id === worktree.runtimeOwnerEnvironmentId)
  )
  const creator = worktree.creatorProvenance
  const canManage =
    worktree.ephemeralVmSharing !== undefined &&
    worktree.runtimeOwnerEnvironmentId !== undefined &&
    (creator?.kind === 'host' ||
      (creator?.kind === 'paired-device' &&
        creator.deviceId === environment?.workspaceVisibilityDeviceId))
  if (!canManage || !worktree.runtimeOwnerEnvironmentId) {
    return null
  }

  const runtimeEnvironmentId = worktree.runtimeOwnerEnvironmentId
  const isShared = worktree.ephemeralVmSharing === 'shared'
  const handleSelect = async (): Promise<void> => {
    setPending(true)
    try {
      await window.api.ephemeralVm.setSharing({
        runtimeEnvironmentId,
        sharing: isShared ? 'private' : 'shared'
      })
      await useAppStore.getState().fetchWorktrees(worktree.repoId, {
        executionHostId: toRuntimeExecutionHostId(runtimeEnvironmentId)
      })
      toast.success(
        isShared
          ? translate(
              'auto.components.sidebar.EphemeralVmSharingMenuItem.privateSuccess',
              'Workspace is private'
            )
          : translate(
              'auto.components.sidebar.EphemeralVmSharingMenuItem.sharedSuccess',
              'Workspace shared with the team'
            )
      )
    } catch (error) {
      toast.error(
        translate(
          'auto.components.sidebar.EphemeralVmSharingMenuItem.error',
          'Could not update workspace sharing'
        ),
        { description: error instanceof Error ? error.message : String(error) }
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <DropdownMenuItem onSelect={() => void handleSelect()} disabled={disabled || pending}>
      {isShared ? <LockKeyhole className="size-3.5" /> : <Users className="size-3.5" />}
      {isShared
        ? translate(
            'auto.components.sidebar.EphemeralVmSharingMenuItem.makePrivate',
            'Make private'
          )
        : translate('auto.components.sidebar.EphemeralVmSharingMenuItem.share', 'Share with team')}
    </DropdownMenuItem>
  )
}

import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { getAllWorktreesFromState, useAllWorktrees } from '@/store/selectors'
import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import {
  findWorktreeForWebWorkspaceReference,
  readWebWorkspaceReference
} from '@/lib/web-workspace-link'
import { isWebClientLocation } from '@/lib/web-client-location'
import { translate } from '@/i18n/i18n'

function showUnavailableWorkspaceToast(description?: string): void {
  toast.error(translate('app.webWorkspaceLink.unavailable', 'Workspace is not available'), {
    description:
      description ??
      translate(
        'app.webWorkspaceLink.unavailableDescription',
        'It may be private, deleted, or shared with a different account.'
      )
  })
}

export function useWebWorkspaceLink(): void {
  const targetEnvironmentId = useMemo(
    () => (isWebClientLocation() ? readWebWorkspaceReference(window.location) : null),
    []
  )
  const worktrees = useAllWorktrees()
  const startupWorktreeRefreshCompleted = useAppStore(
    (state) => state.startupWorktreeRefreshCompleted
  )
  const handledRef = useRef(false)
  const resolvingRef = useRef(false)

  useEffect(() => {
    if (!targetEnvironmentId || handledRef.current) {
      return
    }
    const worktree = findWorktreeForWebWorkspaceReference(worktrees, targetEnvironmentId)
    if (worktree) {
      handledRef.current = true
      void activateWorktreeFromSidebar(worktree.id, toRuntimeExecutionHostId(targetEnvironmentId))
      return
    }
    if (!startupWorktreeRefreshCompleted) {
      return
    }
    if (resolvingRef.current) {
      return
    }
    resolvingRef.current = true
    void (async () => {
      try {
        const runtimes = await window.api.ephemeralVm.listRuntimes()
        const runtime = runtimes.find((entry) => entry.runtimeEnvironmentId === targetEnvironmentId)
        if (!runtime?.workspaceId) {
          handledRef.current = true
          showUnavailableWorkspaceToast()
          return
        }
        await window.api.ephemeralVm.resumeWorkspace({ workspaceId: runtime.workspaceId })
        const state = useAppStore.getState()
        state.setRuntimeEnvironments(await window.api.runtimeEnvironments.list())
        await state.fetchAllWorktrees()
        const refreshedWorktree = findWorktreeForWebWorkspaceReference(
          getAllWorktreesFromState(useAppStore.getState()),
          targetEnvironmentId
        )
        handledRef.current = true
        if (!refreshedWorktree) {
          showUnavailableWorkspaceToast()
          return
        }
        await activateWorktreeFromSidebar(
          refreshedWorktree.id,
          toRuntimeExecutionHostId(targetEnvironmentId)
        )
      } catch (error) {
        handledRef.current = true
        showUnavailableWorkspaceToast(error instanceof Error ? error.message : String(error))
      }
    })()
  }, [startupWorktreeRefreshCompleted, targetEnvironmentId, worktrees])
}

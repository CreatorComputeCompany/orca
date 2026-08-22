import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import type { Worktree } from '../../../shared/worktree/types'
import { activateWorktreeFromSidebar } from './sidebar-worktree-activation'
import { useAppStore } from '@/store'

const LIVE_MEMBER_TAB_WAIT_MS = 5_000

type LiveMemberTarget = {
  activeTabId?: string
  activeTabType?: 'terminal' | 'markdown' | 'file' | 'browser'
}

export async function followLiveMemberTarget(
  worktree: Worktree,
  member: LiveMemberTarget
): Promise<void> {
  const executionHostId = worktree.runtimeOwnerEnvironmentId
    ? toRuntimeExecutionHostId(worktree.runtimeOwnerEnvironmentId)
    : undefined
  await activateWorktreeFromSidebar(worktree.id, executionHostId)
  if (!member.activeTabId || member.activeTabType !== 'terminal') {
    return
  }
  const tab = await waitForTerminalTab(worktree.id, member.activeTabId)
  if (tab) {
    useAppStore.getState().setActiveTab(member.activeTabId)
  }
}

function findTerminalTab(worktreeId: string, tabId: string) {
  return useAppStore.getState().tabsByWorktree[worktreeId]?.find((tab) => tab.id === tabId)
}

async function waitForTerminalTab(worktreeId: string, tabId: string) {
  const existing = findTerminalTab(worktreeId, tabId)
  if (existing) {
    return existing
  }
  return await new Promise<ReturnType<typeof findTerminalTab>>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      unsubscribe()
      resolve(undefined)
    }, LIVE_MEMBER_TAB_WAIT_MS)
    const unsubscribe = useAppStore.subscribe(() => {
      const tab = findTerminalTab(worktreeId, tabId)
      if (!tab) {
        return
      }
      window.clearTimeout(timeoutId)
      unsubscribe()
      resolve(tab)
    })
    const racedTab = findTerminalTab(worktreeId, tabId)
    if (racedTab) {
      window.clearTimeout(timeoutId)
      unsubscribe()
      resolve(racedTab)
    }
  })
}

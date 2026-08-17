import { beforeEach, describe, expect, it, vi } from 'vitest'

const { activateWorktreeFromSidebar, setActiveTab, state } = vi.hoisted(() => ({
  activateWorktreeFromSidebar: vi.fn().mockResolvedValue(undefined),
  setActiveTab: vi.fn(),
  state: {
    tabsByWorktree: {} as Record<string, { id: string }[]>,
    setActiveTab: vi.fn()
  }
}))

state.setActiveTab = setActiveTab

vi.mock('./sidebar-worktree-activation', () => ({ activateWorktreeFromSidebar }))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => state,
    subscribe: vi.fn()
  }
}))

import { followLiveMemberTarget } from './worktree-live-member-navigation'

const worktree = {
  id: 'worktree-1',
  runtimeOwnerEnvironmentId: 'environment-1'
} as never

describe('live member navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.tabsByWorktree = { 'worktree-1': [{ id: 'terminal-2' }] }
  })

  it('opens the worktree and activates the member terminal', async () => {
    await followLiveMemberTarget(worktree, {
      activeTabId: 'terminal-2',
      activeTabType: 'terminal'
    })

    expect(activateWorktreeFromSidebar).toHaveBeenCalledWith('worktree-1', 'runtime:environment-1')
    expect(setActiveTab).toHaveBeenCalledWith('terminal-2')
  })

  it('opens only the worktree when the member is not viewing a terminal', async () => {
    await followLiveMemberTarget(worktree, {
      activeTabId: 'file-1',
      activeTabType: 'file'
    })

    expect(activateWorktreeFromSidebar).toHaveBeenCalledOnce()
    expect(setActiveTab).not.toHaveBeenCalled()
  })
})

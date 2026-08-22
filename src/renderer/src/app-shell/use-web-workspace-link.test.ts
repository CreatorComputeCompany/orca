// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../shared/worktree/types'

const mocks = vi.hoisted(() => {
  const state = {
    startupWorktreeRefreshCompleted: false,
    activeWorktreeId: null as string | null,
    activeWorkspaceExecutionHostId: null as string | null,
    activeTabIdByWorktree: {} as Record<string, string>,
    tabsByWorktree: {} as Record<
      string,
      { id: string; title: string; customTitle: string | null }[]
    >,
    setRuntimeEnvironments: vi.fn(),
    fetchAllWorktrees: vi.fn(),
    revealWorktreeInSidebar: vi.fn(),
    setActiveTab: vi.fn()
  }
  const useAppStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state, subscribe: vi.fn() }
  )
  return {
    state,
    useAppStore,
    worktrees: [] as Worktree[],
    refreshedWorktrees: [] as Worktree[],
    activateWorktreeFromSidebar: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    toastWarning: vi.fn()
  }
})

vi.mock('@/store', () => ({ useAppStore: mocks.useAppStore }))
vi.mock('@/store/selectors', () => ({
  useAllWorktrees: () => mocks.worktrees,
  getAllWorktreesFromState: () => mocks.refreshedWorktrees
}))
vi.mock('@/lib/sidebar-worktree-activation', () => ({
  activateWorktreeFromSidebar: mocks.activateWorktreeFromSidebar
}))
vi.mock('@/lib/web-client-location', () => ({ isWebClientLocation: () => true }))
vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess, warning: mocks.toastWarning }
}))

import { useWebWorkspaceLink } from './use-web-workspace-link'

describe('useWebWorkspaceLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.worktrees = []
    mocks.refreshedWorktrees = []
    mocks.state.startupWorktreeRefreshCompleted = false
    mocks.state.activeWorktreeId = null
    mocks.state.activeWorkspaceExecutionHostId = null
    mocks.state.activeTabIdByWorktree = {}
    mocks.state.tabsByWorktree = {}
    mocks.state.setActiveTab.mockImplementation((tabId: string) => {
      if (mocks.state.activeWorktreeId) {
        mocks.state.activeTabIdByWorktree[mocks.state.activeWorktreeId] = tabId
      }
    })
    mocks.activateWorktreeFromSidebar.mockImplementation(async (worktreeId, executionHostId) => {
      mocks.state.activeWorktreeId = worktreeId
      mocks.state.activeWorkspaceExecutionHostId = executionHostId
    })
    window.history.replaceState(null, '', '/web-index.html?workspace=runtime-123')
    Object.assign(window, {
      api: {
        ephemeralVm: {
          listRuntimes: vi.fn().mockResolvedValue([]),
          resumeWorkspace: vi.fn()
        },
        runtimeEnvironments: { list: vi.fn().mockResolvedValue([]) }
      }
    })
  })

  it('opens an accessible running workspace as soon as its worktree is available', async () => {
    mocks.state.startupWorktreeRefreshCompleted = true
    mocks.worktrees = [{ id: 'worktree-1', runtimeOwnerEnvironmentId: 'runtime-123' } as Worktree]

    renderHook(() => useWebWorkspaceLink())

    await waitFor(() =>
      expect(mocks.activateWorktreeFromSidebar).toHaveBeenCalledWith(
        'worktree-1',
        'runtime:runtime-123'
      )
    )
    expect(mocks.state.revealWorktreeInSidebar).toHaveBeenCalledWith('worktree-1', {
      behavior: 'smooth'
    })
  })

  it('opens the exact synchronized terminal session when the URL names one', async () => {
    mocks.state.startupWorktreeRefreshCompleted = true
    window.history.replaceState(
      null,
      '',
      '/web-index.html?workspace=runtime-123&session=host-tab-456'
    )
    mocks.worktrees = [
      {
        id: 'worktree-1',
        displayName: 'Shared worktree',
        runtimeOwnerEnvironmentId: 'runtime-123'
      } as Worktree
    ]
    mocks.state.tabsByWorktree = {
      'worktree-1': [{ id: 'web-terminal-host-tab-456', title: 'Codex session', customTitle: null }]
    }

    renderHook(() => useWebWorkspaceLink())

    await waitFor(() =>
      expect(mocks.state.setActiveTab).toHaveBeenCalledWith('web-terminal-host-tab-456')
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Opened Codex session')
  })

  it('does not activate a persisted workspace row before startup refresh completes', async () => {
    mocks.worktrees = [
      { id: 'stale-worktree', runtimeOwnerEnvironmentId: 'runtime-123' } as Worktree
    ]

    renderHook(() => useWebWorkspaceLink())

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(mocks.activateWorktreeFromSidebar).not.toHaveBeenCalled()
  })

  it('wakes and refreshes an accessible sleeping workspace before opening it', async () => {
    mocks.state.startupWorktreeRefreshCompleted = true
    mocks.refreshedWorktrees = [
      { id: 'worktree-1', runtimeOwnerEnvironmentId: 'runtime-123' } as Worktree
    ]
    vi.mocked(window.api.ephemeralVm.listRuntimes).mockResolvedValue([
      { runtimeEnvironmentId: 'runtime-123', workspaceId: 'worktree-1' } as never
    ])

    renderHook(() => useWebWorkspaceLink())

    await waitFor(() =>
      expect(window.api.ephemeralVm.resumeWorkspace).toHaveBeenCalledWith({
        workspaceId: 'worktree-1'
      })
    )
    expect(mocks.state.revealWorktreeInSidebar).toHaveBeenCalledWith('worktree-1', {
      behavior: 'smooth'
    })
    await waitFor(() =>
      expect(mocks.activateWorktreeFromSidebar).toHaveBeenCalledWith(
        'worktree-1',
        'runtime:runtime-123'
      )
    )
  })

  it('does not reveal an inaccessible workspace reference', async () => {
    mocks.state.startupWorktreeRefreshCompleted = true

    renderHook(() => useWebWorkspaceLink())

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(mocks.activateWorktreeFromSidebar).not.toHaveBeenCalled()
  })
})

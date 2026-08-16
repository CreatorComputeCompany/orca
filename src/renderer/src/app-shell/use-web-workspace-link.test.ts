// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../shared/worktree/types'

const mocks = vi.hoisted(() => {
  const state = {
    startupWorktreeRefreshCompleted: false,
    setRuntimeEnvironments: vi.fn(),
    fetchAllWorktrees: vi.fn()
  }
  const useAppStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state }
  )
  return {
    state,
    useAppStore,
    worktrees: [] as Worktree[],
    refreshedWorktrees: [] as Worktree[],
    activateWorktreeFromSidebar: vi.fn(),
    toastError: vi.fn()
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
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

import { useWebWorkspaceLink } from './use-web-workspace-link'

describe('useWebWorkspaceLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.worktrees = []
    mocks.refreshedWorktrees = []
    mocks.state.startupWorktreeRefreshCompleted = false
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
    mocks.worktrees = [{ id: 'worktree-1', runtimeOwnerEnvironmentId: 'runtime-123' } as Worktree]

    renderHook(() => useWebWorkspaceLink())

    await waitFor(() =>
      expect(mocks.activateWorktreeFromSidebar).toHaveBeenCalledWith(
        'worktree-1',
        'runtime:runtime-123'
      )
    )
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

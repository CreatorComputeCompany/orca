import { beforeEach, expect, it, vi } from 'vitest'
import type { PendingWorktreeCreation } from './pending-worktree-creation'

const { prepareTargetMock } = vi.hoisted(() => ({ prepareTargetMock: vi.fn() }))

const store = {
  repos: [{ id: 'repo-1' }],
  runtimeEnvironments: [] as { id: string }[],
  setRuntimeEnvironments: vi.fn(),
  pendingWorktreeCreations: {} as Record<string, PendingWorktreeCreation>,
  activePendingCreationId: 'creation-1',
  updatePendingWorktreeCreation: vi.fn(),
  setupProjectExistingFolder: vi.fn()
}

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('@/lib/ephemeral-vm-workspace-target', () => ({
  prepareEphemeralVmWorkspaceTarget: prepareTargetMock
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { prepareRequestForCreate } from './ephemeral-vm-worktree-creation'

beforeEach(() => {
  vi.clearAllMocks()
  store.pendingWorktreeCreations = {
    'creation-1': {
      creationId: 'creation-1',
      phase: 'provisioning-vm',
      status: 'creating',
      startedAt: 1,
      indeterminate: true,
      loaderVisible: true,
      request: {} as never
    }
  }
  store.runtimeEnvironments = []
  globalThis.window = {
    api: { ephemeralVm: { onProvisionEvent: vi.fn(() => vi.fn()) } }
  } as never
})

it('publishes a newly provisioned VM before exposing its workspace', async () => {
  prepareTargetMock.mockResolvedValue({
    ok: true,
    runtimeId: 'runtime-1',
    checkoutMode: 'orca-worktree',
    environmentId: 'environment-1',
    environment: { id: 'environment-1', name: 'Steven VM' },
    stderr: '',
    warnings: [],
    setup: {
      project: { id: 'project-1' },
      setup: {
        id: 'setup-runtime',
        projectId: 'project-1',
        hostId: 'runtime:environment-1'
      },
      repo: { id: 'repo-runtime', path: '/workspace/repo' }
    }
  })

  await prepareRequestForCreate('creation-1', {
    repoId: 'repo-1',
    name: 'steven-owner-proof',
    setupDecision: 'inherit',
    agent: null,
    pendingFirstAgentMessageRename: false,
    note: '',
    startupPlan: null,
    quickPrompt: '',
    quickTelemetry: null,
    ephemeralVmRecipe: {
      sourceRepoId: 'repo-1',
      recipeId: 'boxd',
      projectId: 'github:creatorcomputecompany/emma',
      checkoutMode: 'orca-worktree'
    }
  })

  expect(store.setRuntimeEnvironments).toHaveBeenCalledWith([
    { id: 'environment-1', name: 'Steven VM' }
  ])
})

it('carries the captured provisioned-root ref identity into adoption', async () => {
  prepareTargetMock.mockResolvedValue({
    ok: true,
    runtimeId: 'runtime-1',
    checkoutMode: 'provisioned-root',
    expectedRefHead: 'abc123',
    stderr: '',
    warnings: [],
    setup: {
      project: { id: 'project-1' },
      setup: {
        id: 'setup-runtime',
        projectId: 'project-1',
        hostId: 'ssh:runtime-ssh-runtime-1'
      },
      repo: { id: 'repo-runtime', path: '/workspace/repo' }
    }
  })

  const prepared = await prepareRequestForCreate('creation-1', {
    repoId: 'repo-1',
    name: 'feature',
    baseBranch: 'origin/main',
    branchNameOverride: 'feature/ref-check',
    setupDecision: 'inherit',
    agent: null,
    pendingFirstAgentMessageRename: false,
    note: '',
    startupPlan: null,
    quickPrompt: '',
    quickTelemetry: null,
    ephemeralVmRecipe: {
      sourceRepoId: 'repo-1',
      recipeId: 'cloud-sandbox',
      projectId: 'github:stablyai/orca',
      checkoutMode: 'provisioned-root'
    }
  })

  expect(prepareTargetMock).toHaveBeenCalledWith(
    expect.objectContaining({ branch: 'feature/ref-check', ref: 'origin/main' })
  )
  expect(prepared).toMatchObject({
    ephemeralVmRuntimeId: 'runtime-1',
    ephemeralVmCheckoutMode: 'provisioned-root',
    ephemeralVmExpectedRefHead: 'abc123'
  })
})

it('turns a rejected VM handoff into a visible creation error', async () => {
  prepareTargetMock.mockRejectedValue(new Error('Timed out while connecting to the workspace VM.'))

  const prepared = await prepareRequestForCreate('creation-1', {
    repoId: 'repo-1',
    name: 'feature',
    setupDecision: 'inherit',
    agent: null,
    pendingFirstAgentMessageRename: false,
    note: '',
    startupPlan: null,
    quickPrompt: '',
    quickTelemetry: null,
    ephemeralVmRecipe: {
      sourceRepoId: 'repo-1',
      recipeId: 'boxd',
      projectId: 'github:creatorcomputecompany/emma',
      checkoutMode: 'orca-worktree'
    }
  })

  expect(prepared).toBeNull()
  expect(store.updatePendingWorktreeCreation).toHaveBeenCalledWith('creation-1', {
    status: 'error',
    error: 'Timed out while connecting to the workspace VM.'
  })
})

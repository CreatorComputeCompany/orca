import { describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../shared/worktree/types'
import {
  collectOrphanedBrowserRuntimeEnvironmentIds,
  purgeOrphanedBrowserRuntimeEnvironments
} from './orphaned-browser-runtime-environments'

describe('orphaned browser runtime environments', () => {
  it('finds owners absent from the authoritative browser catalog', () => {
    const worktreesByRepo = {
      repo: [
        { id: 'current', runtimeOwnerEnvironmentId: 'env-current' },
        { id: 'revoked', runtimeOwnerEnvironmentId: 'env-revoked' },
        { id: 'local' },
        { id: 'duplicate', runtimeOwnerEnvironmentId: 'env-revoked' }
      ] as Worktree[]
    }

    expect(
      collectOrphanedBrowserRuntimeEnvironmentIds({
        runtimeEnvironmentIds: ['env-current'],
        worktreesByRepo
      })
    ).toEqual(['env-revoked'])
  })

  it('combines explicit tombstones with already-orphaned hydrated rows', async () => {
    const retire = vi.fn()
    await purgeOrphanedBrowserRuntimeEnvironments({
      runtimeEnvironmentsApi: {
        consumeRetiredEnvironmentIds: async () => ['env-explicit']
      } as never,
      state: {
        runtimeEnvironments: [{ id: 'env-current' }],
        worktreesByRepo: {
          repo: [{ id: 'revoked', runtimeOwnerEnvironmentId: 'env-orphaned' }] as Worktree[]
        }
      },
      retire
    })

    expect(retire).toHaveBeenCalledWith(['env-explicit', 'env-orphaned'])
  })
})

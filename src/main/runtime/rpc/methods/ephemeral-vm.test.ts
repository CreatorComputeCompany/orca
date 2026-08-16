import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcContext, RpcMethod } from '../core'
import {
  EPHEMERAL_VM_METHODS,
  setEphemeralVmRpcReadService,
  type EphemeralVmRpcReadService
} from './ephemeral-vm'

function method(name: string): RpcMethod {
  const found = EPHEMERAL_VM_METHODS.find((entry) => entry.name === name)
  if (!found) {
    throw new Error(`missing ${name}`)
  }
  return found
}

const context = {
  runtime: {},
  pairedDeviceId: 'device-jake',
  clientKind: 'runtime'
} as RpcContext

afterEach(() => setEphemeralVmRpcReadService(null))

describe('ephemeral VM serve RPC reads', () => {
  it('validates identifiers before delegating', () => {
    expect(method('ephemeralVm.listRecipes').params?.safeParse({ repoId: '' }).success).toBe(false)
    expect(
      method('ephemeralVm.doctor').params?.safeParse({ repoId: 'repo-1', recipeId: '' }).success
    ).toBe(false)
  })

  it('delegates reads to the controller-owned lifecycle service', async () => {
    const service = {
      listRecipes: vi.fn().mockResolvedValue({
        status: 'ok',
        repoPath: '/repo',
        recipes: [],
        diagnostics: []
      }),
      listRecipeCatalog: vi.fn().mockResolvedValue([]),
      doctor: vi.fn().mockResolvedValue({ ok: true, checks: [] }),
      listRuntimes: vi.fn().mockResolvedValue([]),
      setSharing: vi.fn().mockResolvedValue({ id: 'runtime-1', sharing: 'shared' }),
      provision: vi.fn().mockResolvedValue({ ok: false, error: 'test', stdout: '', stderr: '' }),
      cancelProvision: vi.fn().mockResolvedValue({ cancelled: true }),
      attachWorkspace: vi.fn().mockResolvedValue({ id: 'runtime-1' }),
      cleanup: vi.fn().mockResolvedValue({ id: 'runtime-1' }),
      resumeWorkspace: vi.fn().mockResolvedValue({ id: 'runtime-1' })
    } as unknown as EphemeralVmRpcReadService
    setEphemeralVmRpcReadService(service)

    await method('ephemeralVm.listRecipes').handler({ repoId: 'repo-1' }, context)
    await method('ephemeralVm.listRecipeCatalog').handler(undefined, context)
    await method('ephemeralVm.doctor').handler({ repoId: 'repo-1', recipeId: 'boxd' }, context)
    await method('ephemeralVm.listRuntimes').handler(undefined, context)
    await method('ephemeralVm.setSharing').handler(
      { runtimeEnvironmentId: 'environment-1', sharing: 'shared' },
      context
    )
    await method('ephemeralVm.provision').handler({ repoId: 'repo-1', recipeId: 'boxd' }, context)
    await method('ephemeralVm.cancelProvision').handler({ provisionId: 'create-1' }, context)
    await method('ephemeralVm.attachWorkspace').handler(
      { runtimeId: 'runtime-1', workspaceId: 'workspace-1' },
      context
    )
    await method('ephemeralVm.cleanup').handler({ runtimeId: 'runtime-1' }, context)
    await method('ephemeralVm.resumeWorkspace').handler({ workspaceId: 'workspace-1' }, context)

    expect(service.listRecipes).toHaveBeenCalledWith({ repoId: 'repo-1' })
    expect(service.listRecipeCatalog).toHaveBeenCalledOnce()
    expect(service.doctor).toHaveBeenCalledWith({ repoId: 'repo-1', recipeId: 'boxd' })
    expect(service.listRuntimes).toHaveBeenCalledWith({
      kind: 'paired-device',
      deviceId: 'device-jake'
    })
    expect(service.setSharing).toHaveBeenCalledWith({
      runtimeEnvironmentId: 'environment-1',
      sharing: 'shared',
      actor: { kind: 'paired-device', deviceId: 'device-jake' }
    })
    expect(service.provision).toHaveBeenCalledWith({
      repoId: 'repo-1',
      recipeId: 'boxd',
      creatorProvenance: { kind: 'paired-device', deviceId: 'device-jake' }
    })
    expect(service.cancelProvision).toHaveBeenCalledWith({ provisionId: 'create-1' })
    expect(service.attachWorkspace).toHaveBeenCalledWith({
      runtimeId: 'runtime-1',
      workspaceId: 'workspace-1',
      actor: { kind: 'paired-device', deviceId: 'device-jake' }
    })
    expect(service.cleanup).toHaveBeenCalledWith({
      runtimeId: 'runtime-1',
      actor: { kind: 'paired-device', deviceId: 'device-jake' }
    })
    expect(service.resumeWorkspace).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      actor: { kind: 'paired-device', deviceId: 'device-jake' }
    })
  })

  it('fails explicitly before the service is wired', () => {
    expect(() => method('ephemeralVm.listRuntimes').handler(undefined, context)).toThrow(
      'Ephemeral VM service is not available'
    )
  })
})

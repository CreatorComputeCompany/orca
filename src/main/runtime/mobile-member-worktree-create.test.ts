import { describe, expect, it, vi } from 'vitest'
import { encodePairingOffer, PAIRING_OFFER_VERSION } from '../../shared/pairing'
import type { EphemeralVmRpcReadService } from './rpc/methods/ephemeral-vm'
import { createMobileMemberWorktree } from './mobile-member-worktree-create'

const actor = { kind: 'paired-device' as const, deviceId: 'jake-phone' }

function makeService() {
  const service = {
    listRecipes: vi.fn().mockResolvedValue({
      status: 'ok',
      repoPath: '/controller/emma',
      recipes: [{ id: 'boxd', name: 'Boxd', create: './create.sh' }],
      diagnostics: []
    }),
    provision: vi.fn().mockResolvedValue({
      ok: true,
      connectionType: 'orca-server',
      runtime: {
        id: 'runtime-1',
        recipeResult: {
          schemaVersion: 1,
          pairingCode: 'manager-code',
          projectRoot: '/home/boxd/emma'
        }
      },
      environment: { id: 'environment-1' },
      pairingCode: encodePairingOffer({
        v: PAIRING_OFFER_VERSION,
        endpoint: 'wss://child.example',
        deviceToken: 'owner-token',
        publicKeyB64: 'owner-key'
      }),
      stderr: '',
      warnings: []
    }),
    attachWorkspace: vi.fn().mockResolvedValue({ id: 'runtime-1' }),
    cleanup: vi.fn().mockResolvedValue({ id: 'runtime-1' })
  }
  return service as unknown as EphemeralVmRpcReadService & typeof service
}

describe('mobile member worktree create', () => {
  it('provisions privately and returns the child create result in the legacy shape', async () => {
    const service = makeService()
    const childResult = { worktree: { id: 'repo-child::/workspaces/bass', name: 'bass' } }
    const callRemote = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        result: { repos: [{ id: 'repo-child', path: '/home/boxd/emma' }] }
      })
      .mockResolvedValueOnce({ ok: true, result: childResult })

    await expect(
      createMobileMemberWorktree({
        params: {
          repo: 'id:repo-controller',
          name: 'bass',
          setupDecision: 'inherit',
          clientMutationId: 'mobile-create-1'
        },
        actor,
        service,
        callRemote
      })
    ).resolves.toEqual(childResult)

    expect(service.provision).toHaveBeenCalledWith({
      repoId: 'repo-controller',
      recipeId: 'boxd',
      workspaceName: 'bass',
      creatorProvenance: actor
    })
    expect(callRemote).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ deviceToken: 'owner-token' }),
      'worktree.create',
      expect.objectContaining({ repo: 'id:repo-child', name: 'bass' }),
      1_800_000
    )
    expect(service.attachWorkspace).toHaveBeenCalledWith({
      runtimeId: 'runtime-1',
      workspaceId: 'repo-child::/workspaces/bass',
      actor
    })
    expect(service.cleanup).not.toHaveBeenCalled()
  })

  it('cleans up the VM when child worktree creation fails', async () => {
    const service = makeService()
    const callRemote = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        result: { repos: [{ id: 'repo-child', path: '/home/boxd/emma/' }] }
      })
      .mockResolvedValueOnce({ ok: false, error: { message: 'branch exists' } })

    await expect(
      createMobileMemberWorktree({
        params: { repo: 'id:repo-controller', name: 'bass' },
        actor,
        service,
        callRemote
      })
    ).rejects.toThrow('branch exists')
    expect(service.cleanup).toHaveBeenCalledWith({ runtimeId: 'runtime-1', actor })
    expect(service.attachWorkspace).not.toHaveBeenCalled()
  })

  it('fails before provisioning when the project has no VM recipe', async () => {
    const service = makeService()
    service.listRecipes.mockResolvedValue({
      status: 'ok',
      repoPath: '/controller/emma',
      recipes: [],
      diagnostics: []
    })

    await expect(
      createMobileMemberWorktree({
        params: { repo: 'id:repo-controller', name: 'bass' },
        actor,
        service
      })
    ).rejects.toThrow('no per-workspace environment recipe')
    expect(service.provision).not.toHaveBeenCalled()
  })
})

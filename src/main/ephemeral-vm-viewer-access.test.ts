import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodePairingOffer, PAIRING_OFFER_VERSION } from '../shared/pairing'
import { addEnvironmentFromPairingCode } from '../shared/runtime-environment-store'
import type { EphemeralVmRuntimeRecord } from '../shared/ephemeral-vm-runtimes'
import { enrollMultiplayerDevice } from './runtime/multiplayer-identity-store'

const { sendRemoteRuntimeRequest } = vi.hoisted(() => ({
  sendRemoteRuntimeRequest: vi.fn()
}))

vi.mock('../shared/remote-runtime-client', () => ({ sendRemoteRuntimeRequest }))

import {
  preserveEphemeralVmViewerCatalogEntry,
  projectEphemeralVmLiveMembers,
  projectEphemeralVmViewerAccess,
  revokeNonOwnerViewerAccess
} from './ephemeral-vm-viewer-access'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ephemeral VM viewer access', () => {
  it('preserves catalog identity without leaking manager access on projection failure', () => {
    const { runtime } = setupRuntime()

    const preserved = preserveEphemeralVmViewerCatalogEntry(runtime)

    expect(preserved).toMatchObject({
      id: runtime.id,
      runtimeEnvironmentId: runtime.runtimeEnvironmentId,
      viewerAccessUnavailable: true,
      recipeResult: { pairingCode: 'orca://pair?unavailable=transient' }
    })
    expect(preserved.recipeResult).not.toMatchObject({ pairingCode: 'orca://pair?code=manager' })
  })

  it('projects active worktrees as named live members', async () => {
    const { userDataPath, runtime } = setupRuntime()
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'jake',
      displayName: 'Jake',
      deviceId: 'jake-controller-device'
    })
    sendRemoteRuntimeRequest.mockResolvedValue({
      ok: true,
      result: {
        members: [
          { grantKey: 'jake', worktreeId: 'wt-jake' },
          { grantKey: 'unknown', worktreeId: 'wt-unknown' }
        ]
      }
    })

    await expect(projectEphemeralVmLiveMembers({ userDataPath, runtime })).resolves.toMatchObject({
      liveMembers: [{ key: 'jake', displayName: 'Jake', worktreeId: 'wt-jake' }]
    })
    expect(sendRemoteRuntimeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ deviceToken: 'manager-token' }),
      'pairing.listManagedRuntimePresence',
      undefined,
      3_000
    )
  })

  it('projects a member-specific child credential instead of the manager credential', async () => {
    const { userDataPath, runtime } = setupRuntime()
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'jake',
      displayName: 'Jake',
      deviceId: 'jake-controller-device'
    })
    sendRemoteRuntimeRequest.mockResolvedValue({
      ok: true,
      result: { pairingUrl: 'orca://pair?code=jake-viewer', deviceId: 'jake-child-device' }
    })

    const projected = await projectEphemeralVmViewerAccess({
      userDataPath,
      runtime,
      actor: { kind: 'paired-device', deviceId: 'jake-controller-device' }
    })

    expect(projected.recipeResult).toMatchObject({
      pairingCode: 'orca://pair?code=jake-viewer'
    })
    expect(sendRemoteRuntimeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ deviceToken: 'manager-token' }),
      'pairing.createManagedRuntimeOffer',
      { grantKey: 'jake', name: 'Jake workspace access' },
      15_000
    )
  })

  it('retains only the owner member grant when making a workspace private', async () => {
    const { userDataPath, runtime } = setupRuntime()
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'steven',
      displayName: 'Steven',
      deviceId: 'steven-controller-device'
    })
    sendRemoteRuntimeRequest.mockResolvedValue({ ok: true, result: { revoked: 1 } })

    await revokeNonOwnerViewerAccess({ userDataPath, runtime })

    expect(sendRemoteRuntimeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ deviceToken: 'manager-token' }),
      'pairing.revokeManagedRuntimeAccess',
      { retainGrantKeys: ['steven'] },
      15_000
    )
  })

  it('fails closed when the child cannot revoke viewer access', async () => {
    const { userDataPath, runtime } = setupRuntime()
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'steven',
      displayName: 'Steven',
      deviceId: 'steven-controller-device'
    })
    sendRemoteRuntimeRequest.mockResolvedValue({
      ok: false,
      error: { message: 'pairing_management_unavailable' }
    })

    await expect(revokeNonOwnerViewerAccess({ userDataPath, runtime })).rejects.toThrow(
      'pairing_management_unavailable'
    )
  })
})

function setupRuntime(): { userDataPath: string; runtime: EphemeralVmRuntimeRecord } {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-viewer-access-'))
  roots.push(userDataPath)
  const environment = addEnvironmentFromPairingCode(userDataPath, {
    name: 'Workspace VM',
    pairingCode: encodePairingOffer({
      v: PAIRING_OFFER_VERSION,
      endpoint: 'wss://workspace.example',
      deviceToken: 'manager-token',
      publicKeyB64: 'manager-key'
    }),
    source: 'ephemeral-vm'
  })
  return {
    userDataPath,
    runtime: {
      id: 'runtime-1',
      recipeId: 'boxd',
      runtimeEnvironmentId: environment.id,
      creatorProvenance: { kind: 'paired-device', deviceId: 'steven-controller-device' },
      ownerMemberKey: 'steven',
      sharing: 'shared',
      connectionMode: 'orca-server',
      status: 'running',
      cleanupStatus: 'not_started',
      createdAt: 1,
      updatedAt: 1,
      recipeResult: {
        schemaVersion: 1,
        pairingCode: 'orca://pair?code=manager',
        projectRoot: '/workspace'
      }
    }
  }
}

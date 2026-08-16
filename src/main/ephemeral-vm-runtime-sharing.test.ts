import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { upsertEphemeralVmRuntime } from '../shared/ephemeral-vm-runtime-store'
import { setEphemeralVmRuntimeSharing } from './ephemeral-vm-runtime-sharing'
import { enrollMultiplayerDevice } from './runtime/multiplayer-identity-store'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('setEphemeralVmRuntimeSharing', () => {
  it('lets the creator share a workspace and rejects another device', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-vm-sharing-'))
    roots.push(userDataPath)
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'jake',
      displayName: 'Jake',
      deviceId: 'device-jake-new'
    })
    upsertEphemeralVmRuntime(userDataPath, {
      id: 'runtime-1',
      recipeId: 'boxd',
      runtimeEnvironmentId: 'environment-1',
      creatorProvenance: { kind: 'paired-device', deviceId: 'device-jake' },
      ownerMemberKey: 'jake',
      sharing: 'private',
      status: 'running',
      cleanupStatus: 'not_started',
      createdAt: 1,
      updatedAt: 1,
      recipeResult: { schemaVersion: 1, pairingCode: 'pairing', projectRoot: '/repo' }
    })

    expect(
      setEphemeralVmRuntimeSharing({
        userDataPath,
        runtimeEnvironmentId: 'environment-1',
        sharing: 'shared',
        actor: { kind: 'paired-device', deviceId: 'device-jake-new' }
      }).sharing
    ).toBe('shared')
    expect(() =>
      setEphemeralVmRuntimeSharing({
        userDataPath,
        runtimeEnvironmentId: 'environment-1',
        sharing: 'private',
        actor: { kind: 'paired-device', deviceId: 'device-niall' }
      })
    ).toThrow('Only the workspace owner')
  })
})

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  listEphemeralVmRuntimes,
  upsertEphemeralVmRuntime
} from '../shared/ephemeral-vm-runtime-store'
import { migrateEphemeralVmRuntimeMemberOwnership } from './ephemeral-vm-runtime-member-ownership'
import { enrollMultiplayerDevice } from './runtime/multiplayer-identity-store'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('ephemeral VM member ownership migration', () => {
  it('backfills an enrolled legacy creator once and leaves unknown creators untouched', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-member-ownership-'))
    roots.push(userDataPath)
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'jake',
      displayName: 'Jake',
      deviceId: 'legacy-jake-browser'
    })
    for (const [id, deviceId] of [
      ['owned', 'legacy-jake-browser'],
      ['unknown', 'unknown-browser']
    ]) {
      upsertEphemeralVmRuntime(userDataPath, {
        id,
        recipeId: 'boxd',
        creatorProvenance: { kind: 'paired-device', deviceId },
        sharing: 'private',
        status: 'running',
        cleanupStatus: 'not_started',
        createdAt: 1,
        updatedAt: 1,
        recipeResult: { schemaVersion: 1, pairingCode: 'pairing', projectRoot: '/repo' }
      })
    }

    expect(migrateEphemeralVmRuntimeMemberOwnership(userDataPath)).toBe(1)
    expect(migrateEphemeralVmRuntimeMemberOwnership(userDataPath)).toBe(0)
    expect(listEphemeralVmRuntimes(userDataPath)).toEqual([
      expect.objectContaining({ id: 'owned', ownerMemberKey: 'jake' }),
      expect.not.objectContaining({ ownerMemberKey: expect.anything() })
    ])
  })
})

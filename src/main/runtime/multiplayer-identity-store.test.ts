import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { EphemeralVmRuntimeRecord } from '../../shared/ephemeral-vm-runtimes'
import {
  canDeviceAccessEphemeralVmRuntime,
  devicesBelongToSameMember,
  enrollMultiplayerDevice,
  findMultiplayerMemberByDevice
} from './multiplayer-identity-store'

const directories: string[] = []

function temporaryUserData(): string {
  const path = mkdtempSync(join(tmpdir(), 'orca-multiplayer-identity-'))
  directories.push(path)
  return path
}

function runtime(
  creatorDeviceId: string,
  sharing: 'private' | 'shared' = 'private',
  ownerMemberKey?: string
): EphemeralVmRuntimeRecord {
  return {
    id: 'runtime-1',
    recipeId: 'boxd',
    creatorProvenance: { kind: 'paired-device', deviceId: creatorDeviceId },
    ...(ownerMemberKey ? { ownerMemberKey } : {}),
    sharing,
    status: 'running',
    cleanupStatus: 'not_started',
    createdAt: 1,
    updatedAt: 1,
    recipeResult: {
      schemaVersion: 1,
      pairingCode: 'test-pairing-code',
      projectRoot: '/workspace'
    }
  }
}

afterEach(() => {
  for (const path of directories.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

describe('multiplayer identity store', () => {
  it('links multiple devices to one durable member', () => {
    const userDataPath = temporaryUserData()
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'Jake',
      displayName: 'Jake',
      deviceId: 'jake-web'
    })
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'jake',
      displayName: 'Jake',
      deviceId: 'jake-mobile'
    })

    expect(devicesBelongToSameMember(userDataPath, 'jake-web', 'jake-mobile')).toBe(true)
    expect(findMultiplayerMemberByDevice(userDataPath, 'jake-mobile')?.deviceIds).toEqual([
      'jake-web',
      'jake-mobile'
    ])
  })

  it('keeps private runtimes within a member and exposes shared runtimes', () => {
    const userDataPath = temporaryUserData()
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'jake',
      displayName: 'Jake',
      deviceId: 'jake-web'
    })
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'jake',
      displayName: 'Jake',
      deviceId: 'jake-mobile'
    })
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'niall',
      displayName: 'Niall',
      deviceId: 'niall-web'
    })

    expect(
      canDeviceAccessEphemeralVmRuntime(userDataPath, 'jake-mobile', runtime('jake-web'))
    ).toBe(true)
    expect(canDeviceAccessEphemeralVmRuntime(userDataPath, 'niall-web', runtime('jake-web'))).toBe(
      false
    )
    expect(
      canDeviceAccessEphemeralVmRuntime(userDataPath, 'niall-web', runtime('jake-web', 'shared'))
    ).toBe(true)
  })

  it('moves a device when it enrolls as another member', () => {
    const userDataPath = temporaryUserData()
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'jake',
      displayName: 'Jake',
      deviceId: 'browser'
    })
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'niall',
      displayName: 'Niall',
      deviceId: 'browser'
    })

    expect(findMultiplayerMemberByDevice(userDataPath, 'browser')?.key).toBe('niall')
  })

  it('uses stable account ownership when the creator device is no longer enrolled', () => {
    const userDataPath = temporaryUserData()
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'jake',
      displayName: 'Jake',
      deviceId: 'jake-phone'
    })
    enrollMultiplayerDevice({
      userDataPath,
      memberKey: 'steven',
      displayName: 'Steven',
      deviceId: 'steven-browser'
    })

    const owned = runtime('retired-creator-browser', 'private', 'jake')
    expect(canDeviceAccessEphemeralVmRuntime(userDataPath, 'jake-phone', owned)).toBe(true)
    expect(canDeviceAccessEphemeralVmRuntime(userDataPath, 'steven-browser', owned)).toBe(false)
  })
})

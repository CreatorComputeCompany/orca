import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DeviceRegistry } from './device-registry'
import { DEVICE_REGISTRY_FILENAME } from './mobile-pairing-files'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('managed runtime access registry', () => {
  it('keeps app tickets memory-only, expiring, and one-shot', () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-managed-runtime-access-'))
    roots.push(root)
    const registry = new DeviceRegistry(root)
    const ticket = registry.addTransientRuntimeDevice('imabird web', Date.now() + 60_000)

    expect(registry.validateToken(ticket.token)?.deviceId).toBe(ticket.deviceId)
    expect(new DeviceRegistry(root).validateToken(ticket.token)).toBeNull()
    expect(registry.consumeTransientDevice(ticket.deviceId)).toBe(true)
    expect(registry.validateToken(ticket.token)).toBeNull()

    const expired = registry.addTransientRuntimeDevice('expired web', Date.now() - 1)
    expect(registry.validateToken(expired.token)).toBeNull()
  })

  it('rotates all runtime credentials when establishing controller authority', () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-managed-runtime-access-'))
    roots.push(root)
    const registry = new DeviceRegistry(root)
    const leaked = registry.addDevice('Legacy runtime', 'runtime')
    const mobile = registry.addDevice('Phone', 'mobile')

    const manager = registry.replaceRuntimeDevicesWithPairingManager('Workspace controller')

    expect(registry.validateToken(leaked.token)).toBeNull()
    expect(registry.validateToken(mobile.token)?.deviceId).toBe(mobile.deviceId)
    expect(registry.validateToken(manager.token)).toMatchObject({ pairingManagement: true })
  })

  it('keeps controller authority stable across workspace runtime restarts', () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-managed-runtime-access-'))
    roots.push(root)
    const registry = new DeviceRegistry(root)
    const manager = registry.replaceRuntimeDevicesWithPairingManager('Workspace controller')

    const restartedRegistry = new DeviceRegistry(root)
    const managerAfterRestart =
      restartedRegistry.replaceRuntimeDevicesWithPairingManager('Workspace controller')

    expect(managerAfterRestart.deviceId).toBe(manager.deviceId)
    expect(managerAfterRestart.token).toBe(manager.token)
  })

  it('reuses member grants and revokes every member except the owner', () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-managed-runtime-access-'))
    roots.push(root)
    const registry = new DeviceRegistry(root)
    const owner = registry.getOrCreateManagedRuntimeDevice('steven', 'Steven access')
    const ownerAgain = registry.getOrCreateManagedRuntimeDevice('steven', 'Steven access')
    const viewer = registry.getOrCreateManagedRuntimeDevice('jake', 'Jake access')

    const revoked = registry.revokeManagedRuntimeDevicesExcept(new Set(['steven']))

    expect(ownerAgain.deviceId).toBe(owner.deviceId)
    expect(revoked.map((device) => device.deviceId)).toEqual([viewer.deviceId])
    expect(registry.validateToken(owner.token)?.managedRuntimeGrantKey).toBe('steven')
    expect(registry.validateToken(viewer.token)).toBeNull()
    expect(
      JSON.parse(readFileSync(join(root, DEVICE_REGISTRY_FILENAME), 'utf8'))
    ).not.toContainEqual(expect.objectContaining({ deviceId: viewer.deviceId }))
  })
})

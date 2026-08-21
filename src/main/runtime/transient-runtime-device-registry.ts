import { randomBytes, randomUUID } from 'node:crypto'
import type { DeviceEntry } from './device-registry'

type TransientDeviceEntry = DeviceEntry & { expiresAt: number }

export class TransientRuntimeDeviceRegistry {
  private devices = new Map<string, TransientDeviceEntry>()

  add(
    name: string,
    expiresAt: number,
    metadata: Pick<DeviceEntry, 'memberWorkspaceOnly' | 'multiplayerMemberKey'> = {}
  ): DeviceEntry {
    const entry: TransientDeviceEntry = {
      deviceId: randomUUID(),
      name,
      token: randomBytes(24).toString('hex'),
      scope: 'runtime',
      pairedAt: Date.now(),
      lastSeenAt: 0,
      pairingReach: 'network',
      ...metadata,
      expiresAt
    }
    this.prune()
    this.devices.set(entry.deviceId, entry)
    return entry
  }

  consume(deviceId: string): boolean {
    return this.devices.delete(deviceId)
  }

  validate(token: string): DeviceEntry | null {
    this.prune()
    return Array.from(this.devices.values()).find((device) => device.token === token) ?? null
  }

  private prune(): void {
    const now = Date.now()
    for (const [deviceId, device] of this.devices) {
      if (device.expiresAt <= now) {
        this.devices.delete(deviceId)
      }
    }
  }
}

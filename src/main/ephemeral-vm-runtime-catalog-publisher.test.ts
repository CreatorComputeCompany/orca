import { describe, expect, it, vi } from 'vitest'
import type { EphemeralVmRuntimeRecord } from '../shared/ephemeral-vm-runtimes'
import { EphemeralVmRuntimeCatalogPublisher } from './ephemeral-vm-runtime-catalog-publisher'

const actor = { kind: 'paired-device' as const, deviceId: 'device-jake' }

function runtime(id: string, liveMember = 'jake'): EphemeralVmRuntimeRecord {
  return {
    id,
    recipeId: 'boxd',
    status: 'running',
    cleanupStatus: 'not_started',
    createdAt: 1,
    updatedAt: 1,
    recipeResult: {
      schemaVersion: 1,
      pairingCode: 'orca://pair?code=test',
      projectRoot: '/workspace'
    },
    liveMembers: [{ key: liveMember, displayName: liveMember, worktreeId: `worktree-${id}` }]
  }
}

describe('ephemeral VM runtime catalog publisher', () => {
  it('publishes only changed snapshots and retains the last valid state through errors', async () => {
    const listRuntimes = vi.fn().mockResolvedValue([runtime('one')])
    const emit = vi.fn()
    const publisher = new EphemeralVmRuntimeCatalogPublisher(listRuntimes)
    const unsubscribe = await publisher.subscribe(actor, emit)

    expect(emit).toHaveBeenLastCalledWith({ type: 'snapshot', runtimes: [runtime('one')] })

    publisher.notifyChanged()
    await vi.waitFor(() => expect(listRuntimes).toHaveBeenCalledTimes(2))
    expect(emit).toHaveBeenCalledTimes(1)

    listRuntimes.mockRejectedValueOnce(new Error('child unavailable'))
    publisher.notifyChanged()
    await vi.waitFor(() => expect(listRuntimes).toHaveBeenCalledTimes(3))
    expect(emit).toHaveBeenCalledTimes(1)

    listRuntimes.mockResolvedValue([runtime('one', 'steven')])
    publisher.notifyChanged()
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(2))
    expect(emit).toHaveBeenLastCalledWith({
      type: 'updated',
      runtimes: [runtime('one', 'steven')]
    })

    unsubscribe()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import {
  EPHEMERAL_VM_METHODS,
  setEphemeralVmRpcReadService,
  type EphemeralVmRpcReadService
} from './ephemeral-vm'

describe('ephemeral VM runtime subscriptions', () => {
  afterEach(() => setEphemeralVmRpcReadService(null))

  it('scopes the stream to the caller and reaps it with the connection', async () => {
    const runtime = new OrcaRuntimeService()
    const unsubscribe = vi.fn()
    const subscribeRuntimes = vi.fn(async (_actor, emit) => {
      emit({ type: 'snapshot', runtimes: [] })
      return unsubscribe
    })
    setEphemeralVmRpcReadService({ subscribeRuntimes } as unknown as EphemeralVmRpcReadService)
    const dispatcher = new RpcDispatcher({ runtime, methods: EPHEMERAL_VM_METHODS })
    const responses: Record<string, unknown>[] = []

    await dispatcher.dispatchStreaming(
      {
        id: 'subscription-1',
        authToken: 'token',
        method: 'ephemeralVm.subscribeRuntimes'
      },
      (response) => responses.push(JSON.parse(response) as Record<string, unknown>),
      {
        connectionId: 'connection-1',
        pairedDeviceId: 'device-jake',
        clientKind: 'runtime'
      }
    )

    expect(subscribeRuntimes).toHaveBeenCalledWith(
      { kind: 'paired-device', deviceId: 'device-jake' },
      expect.any(Function)
    )
    expect(responses).toMatchObject([{ ok: true, result: { type: 'snapshot', runtimes: [] } }])

    runtime.cleanupSubscriptionsForConnection('connection-1')
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce())
  })
})

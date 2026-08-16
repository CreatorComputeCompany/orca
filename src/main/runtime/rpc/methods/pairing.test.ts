import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { PAIRING_METHODS } from './pairing'

function dispatchPairing(
  method: string,
  params: unknown,
  pairing: NonNullable<Parameters<RpcDispatcher['dispatchStreaming']>[2]>['pairing']
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const dispatcher = new RpcDispatcher({
      runtime: new OrcaRuntimeService(),
      methods: PAIRING_METHODS
    })
    void dispatcher.dispatchStreaming(
      { id: 'request-1', authToken: '', method, params },
      (response) => resolve(JSON.parse(response) as Record<string, unknown>),
      { pairing }
    )
  })
}

describe('pairing RPC methods', () => {
  it('keeps managed runtime grants behind the pairing-management context', async () => {
    const createManagedRuntimeOffer = vi.fn().mockResolvedValue({
      pairingUrl: 'orca://pair?code=viewer',
      deviceId: 'viewer-device'
    })
    const revokeManagedRuntimeAccess = vi.fn().mockResolvedValue({ revoked: 1 })
    const listManagedRuntimePresence = vi.fn().mockResolvedValue({ grantKeys: ['steven'] })
    const pairing = {
      getEndpoints: vi.fn(),
      provisionRelay: vi.fn(),
      createManagedRuntimeOffer,
      revokeManagedRuntimeAccess,
      listManagedRuntimePresence
    }

    await expect(
      dispatchPairing('pairing.listManagedRuntimePresence', undefined, pairing)
    ).resolves.toMatchObject({ ok: true, result: { grantKeys: ['steven'] } })
    await expect(
      dispatchPairing(
        'pairing.createManagedRuntimeOffer',
        { grantKey: 'steven', name: 'Steven access' },
        pairing
      )
    ).resolves.toMatchObject({ ok: true })
    await expect(
      dispatchPairing(
        'pairing.revokeManagedRuntimeAccess',
        { retainGrantKeys: ['steven'] },
        pairing
      )
    ).resolves.toMatchObject({ ok: true })
    expect(createManagedRuntimeOffer).toHaveBeenCalledWith({
      grantKey: 'steven',
      name: 'Steven access'
    })
    expect(revokeManagedRuntimeAccess).toHaveBeenCalledWith({ retainGrantKeys: ['steven'] })
    expect(listManagedRuntimePresence).toHaveBeenCalledOnce()

    await expect(
      dispatchPairing(
        'pairing.createManagedRuntimeOffer',
        { grantKey: 'steven', name: 'Steven access' },
        { getEndpoints: vi.fn(), provisionRelay: vi.fn() }
      )
    ).resolves.toMatchObject({ ok: false })
  })
  it('passes only phone-owned credential material to the server-bound provider', async () => {
    const provisionRelay = vi.fn().mockResolvedValue({
      v: 1,
      reqId: 'install-1',
      authorizationMode: 'authenticated-direct',
      currentVersion: 1,
      resumeExpiresAt: Date.now() + 60_000
    })
    const pairing = { getEndpoints: vi.fn(), provisionRelay, createMobileOffer: vi.fn() }

    await expect(
      dispatchPairing(
        'pairing.provisionRelay',
        { reqId: 'install-1', newResumeTokenHash: 'A'.repeat(43) },
        pairing
      )
    ).resolves.toMatchObject({ ok: true })
    expect(provisionRelay).toHaveBeenCalledWith({
      reqId: 'install-1',
      newResumeTokenHash: 'A'.repeat(43)
    })
  })

  it('rejects caller-selected identity and authorization metadata', async () => {
    const pairing = {
      getEndpoints: vi.fn(),
      provisionRelay: vi.fn(),
      createMobileOffer: vi.fn()
    }

    for (const injected of [
      { relayDeviceId: 'attacker-device' },
      { authorization: { mode: 'relay-basis', basisConnId: 'attacker-basis' } },
      { directAuthId: 'attacker-direct' },
      { acceptedCredentialVersion: 99 }
    ]) {
      await expect(
        dispatchPairing(
          'pairing.provisionRelay',
          { reqId: 'install-1', newResumeTokenHash: 'A'.repeat(43), ...injected },
          pairing
        )
      ).resolves.toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    }
    await expect(
      dispatchPairing(
        'pairing.getEndpoints',
        { installReqId: 'status-1', basisConnId: 'injected' },
        pairing
      )
    ).resolves.toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    expect(pairing.provisionRelay).not.toHaveBeenCalled()
    expect(pairing.getEndpoints).not.toHaveBeenCalled()
  })

  it('mints mobile offers only from validated host-owned inputs', async () => {
    const createMobileOffer = vi.fn().mockResolvedValue({ available: false })
    const pairing = {
      getEndpoints: vi.fn(),
      provisionRelay: vi.fn(),
      createMobileOffer
    }

    await expect(
      dispatchPairing(
        'pairing.createMobileOffer',
        {
          address: 'wss://orca.example.test',
          connectionMode: 'local-only',
          rotate: true
        },
        pairing
      )
    ).resolves.toMatchObject({ ok: true })
    expect(createMobileOffer).toHaveBeenCalledWith({
      address: 'wss://orca.example.test',
      connectionMode: 'local-only',
      rotate: true
    })

    await expect(
      dispatchPairing(
        'pairing.createMobileOffer',
        { address: 'wss://orca.example.test', deviceId: 'attacker-device' },
        pairing
      )
    ).resolves.toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
  })
})

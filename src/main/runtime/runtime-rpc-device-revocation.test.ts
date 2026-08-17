import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'
import { OrcaRuntimeRpcServer } from './runtime-rpc'
import { parsePairingCode } from '../../shared/pairing'
import { sendRemoteRuntimeRequest } from '../../shared/remote-runtime-client'
import { generateKeyPair } from './rpc/e2ee-crypto'
import { waitFor } from './runtime-rpc-test-harness'
import {
  connectWs,
  nextWsMessage,
  waitForWsClose,
  authenticateMobileWs
} from './runtime-rpc-mobile-ws-test-harness'

vi.mock('../git/worktree', () => {
  const worktrees = [
    {
      path: '/tmp/worktree-a',
      head: 'abc',
      branch: 'feature/foo',
      isBare: false,
      isMainWorktree: false
    }
  ]
  return {
    listWorktrees: vi.fn().mockResolvedValue(worktrees),
    listWorktreesStrict: vi.fn().mockResolvedValue(worktrees)
  }
})

describe('OrcaRuntimeRpcServer', () => {
  it('cleans up pre-auth E2EE WebSocket state when the socket closes', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-rpc-'))
    const runtime = new OrcaRuntimeService()
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath,
      enableWebSocket: true,
      wsPort: 0
    })

    await server.start()

    try {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'mobile-test',
        scope: 'mobile'
      })
      expect(offer.available).toBe(true)
      if (!offer.available) {
        throw new Error('WebSocket pairing unavailable')
      }
      const parsed = parsePairingCode(offer.pairingUrl)!
      const ws = await connectWs(parsed.endpoint)
      const mobileKeys = generateKeyPair()
      ws.send(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: Buffer.from(mobileKeys.publicKey).toString('base64')
        })
      )
      expect(JSON.parse(await nextWsMessage(ws))).toEqual({ type: 'e2ee_ready' })
      expect(server['mobileSocketWiring']?.channelCount).toBe(1)
      expect(server['mobileSocketWiring']?.connectionCount).toBe(1)

      ws.close()
      await waitForWsClose(ws)
      await waitFor(
        () =>
          server['mobileSocketWiring']?.channelCount === 0 &&
          server['mobileSocketWiring']?.connectionCount === 0
      )
    } finally {
      await server.stop()
    }
  })

  it('terminates active WebSockets for a revoked mobile device', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-rpc-'))
    const runtime = new OrcaRuntimeService()
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath,
      enableWebSocket: true,
      wsPort: 0
    })
    const disconnectSpy = vi.spyOn(runtime, 'onClientDisconnected')

    await server.start()

    try {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'mobile-test',
        scope: 'mobile'
      })
      expect(offer.available).toBe(true)
      if (!offer.available) {
        throw new Error('WebSocket pairing unavailable')
      }
      const first = await authenticateMobileWs(offer.pairingUrl)
      const second = await authenticateMobileWs(offer.pairingUrl)

      await expect(server.revokeMobileDevice(offer.deviceId)).resolves.toBe(true)
      await Promise.all([waitForWsClose(first), waitForWsClose(second)])
      await waitFor(
        () =>
          server['mobileSocketWiring']?.channelCount === 0 &&
          server['mobileSocketWiring']?.connectionCount === 0
      )

      expect(disconnectSpy).toHaveBeenCalledTimes(1)
    } finally {
      disconnectSpy.mockRestore()
      await server.stop()
    }
  }, 15_000)

  it('does not revoke runtime-scoped devices through mobile revocation', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-rpc-'))
    const runtime = new OrcaRuntimeService()
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath,
      enableWebSocket: true,
      wsPort: 0
    })

    await server.start()

    try {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'runtime-test',
        scope: 'runtime'
      })
      expect(offer.available).toBe(true)
      if (!offer.available) {
        throw new Error('WebSocket pairing unavailable')
      }

      await expect(server.revokeMobileDevice(offer.deviceId)).resolves.toBe(false)
      expect(server.getDeviceRegistry()?.getDevice(offer.deviceId)?.scope).toBe('runtime')
    } finally {
      await server.stop()
    }
  })

  it('terminates active WebSockets for a revoked runtime access grant', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-rpc-'))
    const runtime = new OrcaRuntimeService()
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath,
      enableWebSocket: true,
      wsPort: 0
    })

    await server.start()

    try {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'runtime-test',
        scope: 'runtime'
      })
      expect(offer.available).toBe(true)
      if (!offer.available) {
        throw new Error('WebSocket pairing unavailable')
      }
      const first = await authenticateMobileWs(offer.pairingUrl)
      const second = await authenticateMobileWs(offer.pairingUrl)

      expect(server.revokeRuntimeAccess(offer.deviceId)).toBe(true)
      await Promise.all([waitForWsClose(first), waitForWsClose(second)])
      await waitFor(
        () =>
          server['mobileSocketWiring']?.channelCount === 0 &&
          server['mobileSocketWiring']?.connectionCount === 0
      )

      expect(server.getDeviceRegistry()?.getDevice(offer.deviceId)).toBeNull()
    } finally {
      await server.stop()
    }
  }, 15_000)

  it('lets only the pairing manager mint and revoke member runtime grants', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-rpc-'))
    const runtime = new OrcaRuntimeService()
    const importCodex = vi
      .spyOn(runtime, 'addCodexAccountFromAuthJson')
      .mockResolvedValue({ state: {} as never, imported: true })
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath,
      enableWebSocket: true,
      wsPort: 0
    })

    await server.start()

    try {
      const manager = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'controller',
        scope: 'runtime',
        pairingManagement: 'exclusive'
      })
      expect(manager.available).toBe(true)
      if (!manager.available) {
        throw new Error('WebSocket pairing unavailable')
      }
      const managerPairing = parsePairingCode(manager.pairingUrl)!
      const owner = await sendRemoteRuntimeRequest<{ pairingUrl: string; deviceId: string }>(
        managerPairing,
        'pairing.createManagedRuntimeOffer',
        { grantKey: 'steven', name: 'Steven access' },
        5_000
      )
      const viewer = await sendRemoteRuntimeRequest<{ pairingUrl: string; deviceId: string }>(
        managerPairing,
        'pairing.createManagedRuntimeOffer',
        { grantKey: 'jake', name: 'Jake access' },
        5_000
      )
      expect(owner.ok).toBe(true)
      expect(viewer.ok).toBe(true)
      if (!owner.ok || !viewer.ok) {
        throw new Error('Managed runtime offer unavailable')
      }
      const viewerPairing = parsePairingCode(viewer.result.pairingUrl)!
      const viewerSocket = await authenticateMobileWs(viewer.result.pairingUrl)
      runtime.registerActiveWorktreePresence('test:jake:wt-1', viewer.result.deviceId, 'wt-1')
      vi.spyOn(runtime, 'listMobileSessionTabs').mockResolvedValue({
        worktree: 'wt-1',
        publicationEpoch: 'presence',
        snapshotVersion: 1,
        activeGroupId: 'group-1',
        activeTabId: 'terminal-2',
        activeTabType: 'terminal',
        tabs: [
          {
            type: 'terminal',
            id: 'terminal-2',
            title: 'Terminal 2',
            parentTabId: 'terminal-2',
            leafId: 'terminal-2',
            status: 'ready',
            terminal: 'term_2',
            isActive: true
          }
        ]
      })

      await expect(
        sendRemoteRuntimeRequest(
          managerPairing,
          'pairing.importManagedRuntimeCodexAccounts',
          { authJson: ['{}'] },
          5_000
        )
      ).resolves.toMatchObject({ ok: true, result: { imported: 1, reused: 0 } })
      expect(importCodex).toHaveBeenCalledWith('{}')
      await expect(
        sendRemoteRuntimeRequest(
          viewerPairing,
          'pairing.importManagedRuntimeCodexAccounts',
          { authJson: ['{}'] },
          5_000
        )
      ).resolves.toMatchObject({ ok: false })

      await expect(
        sendRemoteRuntimeRequest(
          managerPairing,
          'pairing.listManagedRuntimePresence',
          undefined,
          5_000
        )
      ).resolves.toMatchObject({
        ok: true,
        result: {
          members: [
            {
              grantKey: 'jake',
              worktreeId: 'wt-1',
              activeTabId: 'terminal-2',
              activeTabTitle: 'Terminal 2',
              activeTabType: 'terminal'
            }
          ]
        }
      })

      await expect(
        sendRemoteRuntimeRequest(
          viewerPairing,
          'pairing.createManagedRuntimeOffer',
          { grantKey: 'attacker', name: 'Attacker access' },
          5_000
        )
      ).resolves.toMatchObject({ ok: false })
      await expect(
        sendRemoteRuntimeRequest(
          managerPairing,
          'pairing.revokeManagedRuntimeAccess',
          { retainGrantKeys: ['steven'] },
          5_000
        )
      ).resolves.toMatchObject({ ok: true, result: { revoked: 1 } })
      await waitForWsClose(viewerSocket)
      await expect(
        sendRemoteRuntimeRequest(
          managerPairing,
          'pairing.listManagedRuntimePresence',
          undefined,
          5_000
        )
      ).resolves.toMatchObject({ ok: true, result: { members: [] } })
      expect(server.getDeviceRegistry()?.getDevice(viewer.result.deviceId)).toBeNull()
      expect(server.getDeviceRegistry()?.getDevice(owner.result.deviceId)).not.toBeNull()
    } finally {
      await server.stop()
    }
  }, 15_000)

  it('rotates unused runtime pairing links without revoking already-used grants', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-rpc-'))
    const runtime = new OrcaRuntimeService()
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath,
      enableWebSocket: true,
      wsPort: 0
    })

    await server.start()

    try {
      const first = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'runtime-test',
        rotate: true,
        scope: 'runtime'
      })
      const second = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'runtime-test',
        rotate: true,
        scope: 'runtime'
      })
      expect(first.available).toBe(true)
      expect(second.available).toBe(true)
      if (!first.available || !second.available) {
        throw new Error('WebSocket pairing unavailable')
      }

      expect(first.deviceId).not.toBe(second.deviceId)
      expect(parsePairingCode(first.pairingUrl)?.deviceToken).not.toBe(
        parsePairingCode(second.pairingUrl)?.deviceToken
      )
      expect(server.getDeviceRegistry()?.getDevice(first.deviceId)).toBeNull()

      server.getDeviceRegistry()?.updateLastSeen(second.deviceId)
      const third = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'runtime-test',
        rotate: true,
        scope: 'runtime'
      })
      expect(third.available).toBe(true)
      if (!third.available) {
        throw new Error('WebSocket pairing unavailable')
      }

      expect(server.getDeviceRegistry()?.getDevice(second.deviceId)).not.toBeNull()
      expect(server.getDeviceRegistry()?.getDevice(third.deviceId)).not.toBeNull()
    } finally {
      await server.stop()
    }
  }, 15_000)
})

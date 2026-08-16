import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePairingCode } from '../../shared/pairing'
import { sendRemoteRuntimeRequest } from '../../shared/remote-runtime-client'
import { OrcaRuntimeService } from './orca-runtime'
import { OrcaRuntimeRpcServer } from './runtime-rpc'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('multiplayer password authentication', () => {
  it('claims an authenticated member once and signs in from the bare HTTP endpoint', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-password-auth-'))
    roots.push(userDataPath)
    const server = new OrcaRuntimeRpcServer({
      runtime: new OrcaRuntimeService(),
      userDataPath,
      enableWebSocket: true,
      wsPort: 0
    })
    await server.start()
    try {
      const bootstrap = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'Bootstrap browser',
        scope: 'runtime',
        fresh: true
      })
      expect(bootstrap.available).toBe(true)
      if (!bootstrap.available) {
        throw new Error(bootstrap.guidance)
      }
      const pairing = parsePairingCode(bootstrap.pairingUrl)!
      const registered = await sendRemoteRuntimeRequest<{
        email: string
        member: { key: string }
        pairingUrl: string
      }>(
        pairing,
        'multiplayer.auth.register',
        {
          email: 'jake@example.com',
          password: 'correct horse battery staple',
          displayName: 'Jake'
        },
        10_000
      )
      expect(registered).toMatchObject({
        ok: true,
        result: { email: 'jake@example.com', member: { key: 'jake' } }
      })

      const endpoint = new URL(bootstrap.endpoint)
      const login = await fetch(`http://127.0.0.1:${endpoint.port}/api/multiplayer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'jake@example.com',
          password: 'correct horse battery staple'
        })
      })
      expect(login.status).toBe(200)
      const result = (await login.json()) as {
        email: string
        member: { key: string }
        pairingUrl: string
      }
      expect(result).toMatchObject({ email: 'jake@example.com', member: { key: 'jake' } })
      const loginPairing = parsePairingCode(result.pairingUrl)!
      await expect(
        sendRemoteRuntimeRequest(loginPairing, 'status.get', undefined, 10_000)
      ).resolves.toMatchObject({ ok: true })

      await expect(
        sendRemoteRuntimeRequest(
          pairing,
          'multiplayer.identity.enroll',
          { memberKey: 'steven', displayName: 'Steven' },
          10_000
        )
      ).resolves.toMatchObject({ ok: false, error: { message: 'password_auth_required' } })
    } finally {
      await server.stop()
    }
  }, 30_000)
})

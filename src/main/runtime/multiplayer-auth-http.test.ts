import { describe, expect, it, vi } from 'vitest'
import { WebSocketTransport } from './rpc/ws-transport'
import { createMultiplayerAuthHttpHandler } from './multiplayer-auth-http'

describe('multiplayer password login HTTP boundary', () => {
  it('returns a no-store personal credential only for valid credentials', async () => {
    const issueLogin = vi.fn(async ({ email, password }) =>
      email === 'jake@example.com' && password === 'correct horse battery staple'
        ? {
            email,
            member: { key: 'jake', displayName: 'Jake', deviceIds: ['device-jake'] },
            pairingUrl: 'orca://pair?code=personal-secret'
          }
        : null
    )
    const transport = await startTransport(issueLogin)
    try {
      const invalid = await login(transport, {
        email: 'jake@example.com',
        password: 'wrong password value'
      })
      expect(invalid.status).toBe(401)
      await expect(invalid.json()).resolves.toEqual({ error: 'invalid_credentials' })

      const valid = await login(transport, {
        email: 'jake@example.com',
        password: 'correct horse battery staple'
      })
      expect(valid.status).toBe(200)
      expect(valid.headers.get('cache-control')).toBe('no-store')
      await expect(valid.json()).resolves.toMatchObject({
        member: { key: 'jake' },
        pairingUrl: 'orca://pair?code=personal-secret'
      })
    } finally {
      await transport.stop()
    }
  })

  it('rate limits repeated failures without exposing account existence', async () => {
    const transport = await startTransport(vi.fn(async () => null))
    try {
      const statuses: number[] = []
      for (let index = 0; index < 6; index += 1) {
        statuses.push(
          (
            await login(transport, {
              email: `unknown-${index}@example.com`,
              password: 'wrong password value'
            })
          ).status
        )
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429])
    } finally {
      await transport.stop()
    }
  })

  it('accepts only JSON and hides internal login failures', async () => {
    const transport = await startTransport(
      vi.fn(async () => {
        throw new Error('account store unavailable at /secret/path')
      })
    )
    try {
      const unsupported = await fetch(
        `http://127.0.0.1:${transport.resolvedPort}/api/multiplayer/login`,
        { method: 'POST', body: 'email=jake@example.com' }
      )
      expect(unsupported.status).toBe(415)
      await expect(unsupported.json()).resolves.toEqual({ error: 'unsupported_media_type' })

      const unavailable = await login(transport, {
        email: 'jake@example.com',
        password: 'correct horse battery staple'
      })
      expect(unavailable.status).toBe(503)
      await expect(unavailable.json()).resolves.toEqual({ error: 'login_unavailable' })
    } finally {
      await transport.stop()
    }
  })
})

async function startTransport(
  issueLogin: Parameters<typeof createMultiplayerAuthHttpHandler>[0]
): Promise<WebSocketTransport> {
  const transport = new WebSocketTransport({
    host: '127.0.0.1',
    port: 0,
    httpRequestHandler: createMultiplayerAuthHttpHandler(issueLogin)
  })
  await transport.start()
  return transport
}

function login(transport: WebSocketTransport, body: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${transport.resolvedPort}/api/multiplayer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

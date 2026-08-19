import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketTransport } from './rpc/ws-transport'
import { createRuntimeAppTicketHttpHandler } from './runtime-app-ticket-http'

const transports: WebSocketTransport[] = []

afterEach(async () => {
  delete process.env.ORCA_RUNTIME_APP_TICKET_SECRET
  await Promise.all(transports.splice(0).map((transport) => transport.stop()))
})

describe('runtime app ticket HTTP boundary', () => {
  it('mints a one-minute no-store ticket for a service-authenticated subject', async () => {
    process.env.ORCA_RUNTIME_APP_TICKET_SECRET = 'service-secret'
    const issueTicket = vi.fn(({ expiresAt }: { expiresAt: number }) => ({
      pairingUrl: 'orca://pair?code=one-shot-secret',
      expiresAt: new Date(expiresAt).toISOString()
    }))
    const transport = await startTransport(issueTicket)

    const response = await requestTicket(transport, 'service-secret', {
      subject: 'github:123',
      name: 'Jake'
    })

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toMatchObject({
      pairingUrl: 'orca://pair?code=one-shot-secret'
    })
    expect(issueTicket).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'github:123', name: 'Jake' })
    )
    const expiresAt = issueTicket.mock.calls[0]![0].expiresAt
    expect(expiresAt - Date.now()).toBeGreaterThan(55_000)
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(60_000)
  })

  it('rejects missing service authority without invoking the issuer', async () => {
    process.env.ORCA_RUNTIME_APP_TICKET_SECRET = 'service-secret'
    const issueTicket = vi.fn()
    const transport = await startTransport(issueTicket)

    const response = await requestTicket(transport, 'wrong-secret', {
      subject: 'github:123'
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' })
    expect(issueTicket).not.toHaveBeenCalled()
  })
})

async function startTransport(
  issueTicket: Parameters<typeof createRuntimeAppTicketHttpHandler>[0]
): Promise<WebSocketTransport> {
  const transport = new WebSocketTransport({
    host: '127.0.0.1',
    port: 0,
    httpRequestHandler: createRuntimeAppTicketHttpHandler(issueTicket)
  })
  transports.push(transport)
  await transport.start()
  return transport
}

function requestTicket(
  transport: WebSocketTransport,
  secret: string,
  body: unknown
): Promise<Response> {
  return fetch(`http://127.0.0.1:${transport.resolvedPort}/api/runtime/app-ticket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}

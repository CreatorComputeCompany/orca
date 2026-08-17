// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebRuntimeClient } from './web-runtime-client'

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3

  readonly readyState = FakeWebSocket.CONNECTING
  binaryType = ''
  onopen: (() => void) | null = null
  onmessage: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  close(): void {}
}

type ClientInternals = {
  childClients: Set<unknown>
  waitForConnected: (timeoutMs?: number) => Promise<void>
  sendEncrypted: (message: unknown) => boolean
}

describe('web runtime shared session-tab subscriptions', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    {
      method: 'session.tabs.subscribe',
      params: { worktree: 'id:wt-1' },
      unsubscribeMethod: 'session.tabs.unsubscribe'
    },
    {
      method: 'session.tabs.subscribeAll',
      params: {},
      unsubscribeMethod: 'session.tabs.unsubscribeAll'
    }
  ])('multiplexes $method on the control socket and cleans it up explicitly', async (args) => {
    const client = new WebRuntimeClient({
      v: 2,
      endpoint: 'wss://runtime.example',
      deviceToken: 'token',
      publicKeyB64: Buffer.alloc(32).toString('base64')
    })
    const internals = client as unknown as ClientInternals
    vi.spyOn(internals, 'waitForConnected').mockResolvedValue(undefined)
    const sent: { id?: string; method?: string; params?: Record<string, unknown> }[] = []
    vi.spyOn(internals, 'sendEncrypted').mockImplementation((message) => {
      sent.push(message as (typeof sent)[number])
      return true
    })

    const subscription = await client.subscribe(args.method, args.params, {
      onResponse: vi.fn()
    })
    const subscribeFrame = sent.find((frame) => frame.method === args.method)

    expect(internals.childClients.size).toBe(0)
    expect(subscribeFrame?.id).toBeTruthy()
    subscription.unsubscribe()
    expect(sent).toContainEqual(
      expect.objectContaining({
        method: args.unsubscribeMethod,
        params: expect.objectContaining({ subscriptionId: subscribeFrame?.id })
      })
    )
    client.close({ notifySubscriptions: false })
  })
})

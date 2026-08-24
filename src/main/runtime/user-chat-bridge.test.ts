import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bootstrapUserChat,
  getUserChatSurface,
  openUserChatDm,
  sendUserChatMessage,
  type UserChatActor
} from './user-chat-bridge'

const actor: UserChatActor = {
  controllerId: 'rt_controller',
  memberKey: 'jake',
  displayName: 'Jake',
  email: 'jake@example.com'
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('user chat bridge', () => {
  it('fails closed when the controller bridge secret is absent', async () => {
    vi.stubEnv('ORCA_CHAT_BRIDGE_SECRET', '')
    await expect(bootstrapUserChat(actor)).rejects.toThrow('user_chat_not_configured')
  })

  it('authenticates the controller request and validates bootstrap data', async () => {
    vi.stubEnv('ORCA_CHAT_BRIDGE_SECRET', 'shared-secret')
    vi.stubEnv('ORCA_USER_CHAT_API_URL', 'https://buzz.example.test/')
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        pubkey: 'a'.repeat(64),
        channels: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'general',
            type: 'channel',
            visibility: 'open',
            participantPubkeys: [],
            lastActivityAtMs: 0,
            unreadCount: 0
          }
        ],
        profiles: [],
        members: []
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(bootstrapUserChat(actor)).resolves.toMatchObject({ pubkey: 'a'.repeat(64) })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://buzz.example.test/api/internal/orca-chat/bootstrap')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer shared-secret')
    expect(JSON.parse(String(init.body))).toEqual({ actor })
  })

  it('rejects malformed signed events returned by the messaging service', async () => {
    vi.stubEnv('ORCA_CHAT_BRIDGE_SECRET', 'shared-secret')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id: 'not-an-event' })))

    await expect(
      sendUserChatMessage(actor, {
        channelId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'hello'
      })
    ).rejects.toThrow()
  })

  it('opens a DM through the Buzz bridge and validates its channel', async () => {
    vi.stubEnv('ORCA_CHAT_BRIDGE_SECRET', 'shared-secret')
    const channel = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: '',
      type: 'dm',
      visibility: 'private',
      participantPubkeys: ['a'.repeat(64), 'b'.repeat(64)],
      lastActivityAtMs: 0,
      unreadCount: 0
    }
    const fetchMock = vi.fn().mockResolvedValue(Response.json(channel))
    vi.stubGlobal('fetch', fetchMock)

    await expect(openUserChatDm(actor, { participantPubkeys: ['b'.repeat(64)] })).resolves.toEqual(
      channel
    )
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://imabird-buzz-web-api.fly.dev/api/internal/orca-chat/open-dm')
    expect(JSON.parse(String(init.body))).toEqual({
      actor,
      participantPubkeys: ['b'.repeat(64)]
    })
  })

  it('requests a focused Buzz surface for an accessible channel', async () => {
    vi.stubEnv('ORCA_CHAT_BRIDGE_SECRET', 'shared-secret')
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ url: 'https://buzz.example.test/?orcaFocused=1' }))
    vi.stubGlobal('fetch', fetchMock)
    const channelId = '550e8400-e29b-41d4-a716-446655440000'

    await expect(getUserChatSurface(actor, { channelId })).resolves.toEqual({
      url: 'https://buzz.example.test/?orcaFocused=1'
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://imabird-buzz-web-api.fly.dev/api/internal/orca-chat/surface')
    expect(JSON.parse(String(init.body))).toEqual({ actor, channelId })
  })
})

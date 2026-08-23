import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootstrapUserChat, sendUserChatMessage, type UserChatActor } from './user-chat-bridge'

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
            participantPubkeys: []
          }
        ],
        profiles: []
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
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { MultiplayerOidcController } from './multiplayer-oidc'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('multiplayer OIDC controller', () => {
  it('supports discovery hosted below the stable issuer URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        issuer: 'https://gsd.example.com',
        authorization_endpoint: 'https://gsd.example.com/api/auth/oauth2/authorize',
        token_endpoint: 'https://gsd.example.com/api/auth/oauth2/token',
        userinfo_endpoint: 'https://gsd.example.com/api/auth/oauth2/userinfo'
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const controller = new MultiplayerOidcController(
      {
        issuer: 'https://gsd.example.com',
        discoveryUrl: 'https://gsd.example.com/api/auth/.well-known/openid-configuration',
        clientId: 'orca-web',
        redirectUrl: 'https://orca.example.com/callback',
        webClientUrl: 'https://orca.example.com/web-index.html'
      },
      vi.fn()
    )

    await expect(controller.createAuthorizationUrl()).resolves.toContain(
      '/api/auth/oauth2/authorize'
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gsd.example.com/api/auth/.well-known/openid-configuration',
      { headers: { Accept: 'application/json' } }
    )
  })

  it('uses authorization code plus PKCE and consumes state once', async () => {
    const issueIdentity = vi.fn(() => ({
      email: 'jake@example.com',
      member: { key: 'jake', displayName: 'Jake', deviceIds: ['device'] },
      pairingUrl: 'orca://pair?code=personal'
    }))
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          issuer: 'https://gsd.example.com/api/auth',
          authorization_endpoint: 'https://gsd.example.com/api/auth/oauth2/authorize',
          token_endpoint: 'https://gsd.example.com/api/auth/oauth2/token',
          userinfo_endpoint: 'https://gsd.example.com/api/auth/oauth2/userinfo'
        })
      )
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token' }))
      .mockResolvedValueOnce(
        jsonResponse({
          sub: 'gsd-user-1',
          email: 'jake@example.com',
          email_verified: true,
          name: 'Jake'
        })
      )
    vi.stubGlobal('fetch', fetchMock)
    const controller = new MultiplayerOidcController(
      {
        issuer: 'https://gsd.example.com/api/auth',
        clientId: 'orca-web',
        redirectUrl: 'https://orca.example.com/api/multiplayer/sso/callback',
        webClientUrl: 'https://orca.example.com/web-index.html'
      },
      issueIdentity
    )

    const authorizationUrl = new URL(await controller.createAuthorizationUrl('jake'))
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorizationUrl.searchParams.get('code_challenge')).toBeTruthy()
    const state = authorizationUrl.searchParams.get('state')!
    const callback = new URL('https://orca.example.com/api/multiplayer/sso/callback')
    callback.searchParams.set('state', state)
    callback.searchParams.set('code', 'authorization-code')

    const destination = await controller.completeCallback(callback)

    expect(destination).toMatch(/^https:\/\/orca\.example\.com\/web-index\.html#sso=/)
    expect(issueIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ issuer: 'https://gsd.example.com/api/auth', sub: 'gsd-user-1' }),
      'jake'
    )
    const tokenRequest = fetchMock.mock.calls[1]
    expect(String(tokenRequest[1]?.body)).toContain('code_verifier=')
    await expect(controller.completeCallback(callback)).rejects.toThrow('expired')
  })

  it('uses the stable subject even when a password account has no verified-email flag', async () => {
    const issueIdentity = vi.fn(() => ({
      email: 'jake@example.com',
      member: { key: 'jake', displayName: 'Jake', deviceIds: ['device'] },
      pairingUrl: 'orca://pair?code=personal'
    }))
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            issuer: 'https://gsd.example.com/api/auth',
            authorization_endpoint: 'https://gsd.example.com/authorize',
            token_endpoint: 'https://gsd.example.com/token',
            userinfo_endpoint: 'https://gsd.example.com/userinfo'
          })
        )
        .mockResolvedValueOnce(jsonResponse({ access_token: 'token' }))
        .mockResolvedValueOnce(
          jsonResponse({ sub: 'user', email: 'jake@example.com', email_verified: false })
        )
    )
    const controller = new MultiplayerOidcController(
      {
        issuer: 'https://gsd.example.com/api/auth',
        clientId: 'orca-web',
        redirectUrl: 'https://orca.example.com/callback',
        webClientUrl: 'https://orca.example.com/web-index.html'
      },
      issueIdentity
    )
    const authorizationUrl = new URL(await controller.createAuthorizationUrl())
    const callback = new URL('https://orca.example.com/callback')
    callback.searchParams.set('state', authorizationUrl.searchParams.get('state')!)
    callback.searchParams.set('code', 'code')

    await expect(controller.completeCallback(callback)).resolves.toContain('#sso=')
    expect(issueIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user', email_verified: false }),
      undefined
    )
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

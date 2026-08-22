import { createHash, randomBytes } from 'node:crypto'
import type { MultiplayerAuthResult } from '../../shared/multiplayer-auth-contract'

const STATE_TTL_MS = 10 * 60 * 1000
const MAX_PENDING_STATES = 32

type OidcMetadata = {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
}

type OidcUser = {
  sub: string
  email: string
  email_verified: boolean
  name?: string
}

type PendingAuthorization = {
  verifier: string
  nonce: string
  memberKey?: string
  createdAt: number
}

export type MultiplayerOidcIdentity = OidcUser & { issuer: string }

export class MultiplayerOidcController {
  private readonly pending = new Map<string, PendingAuthorization>()
  private metadata: OidcMetadata | null = null

  constructor(
    private readonly config: {
      issuer: string
      discoveryUrl?: string
      clientId: string
      redirectUrl: string
      webClientUrl: string
    },
    private readonly issueIdentity: (
      identity: MultiplayerOidcIdentity,
      memberKey?: string
    ) => MultiplayerAuthResult
  ) {}

  static fromEnvironment(
    issueIdentity: (identity: MultiplayerOidcIdentity, memberKey?: string) => MultiplayerAuthResult
  ): MultiplayerOidcController | null {
    const issuer = process.env.ORCA_GSD_OIDC_ISSUER?.replace(/\/$/, '')
    const discoveryUrl = process.env.ORCA_GSD_OIDC_DISCOVERY_URL
    const redirectUrl = process.env.ORCA_GSD_OIDC_REDIRECT_URL
    const webClientUrl = process.env.ORCA_WEB_CLIENT_URL
    if (!issuer || !redirectUrl || !webClientUrl) {
      return null
    }
    for (const value of [issuer, discoveryUrl, redirectUrl, webClientUrl]) {
      if (!value) {
        continue
      }
      if (new URL(value).protocol !== 'https:') {
        throw new Error('GSD shared login URLs must use HTTPS.')
      }
    }
    return new MultiplayerOidcController(
      {
        issuer,
        ...(discoveryUrl ? { discoveryUrl } : {}),
        clientId: process.env.ORCA_GSD_OIDC_CLIENT_ID ?? 'orca-web',
        redirectUrl,
        webClientUrl
      },
      issueIdentity
    )
  }

  async createAuthorizationUrl(memberKey?: string): Promise<string> {
    this.prunePending()
    if (this.pending.size >= MAX_PENDING_STATES) {
      throw new Error('Too many shared-login attempts are pending.')
    }
    const metadata = await this.getMetadata()
    const state = randomBytes(24).toString('base64url')
    const verifier = randomBytes(32).toString('base64url')
    const nonce = randomBytes(24).toString('base64url')
    this.pending.set(state, {
      verifier,
      nonce,
      ...(memberKey ? { memberKey } : {}),
      createdAt: Date.now()
    })
    const url = new URL(metadata.authorization_endpoint)
    url.searchParams.set('client_id', this.config.clientId)
    url.searchParams.set('redirect_uri', this.config.redirectUrl)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'openid profile email')
    url.searchParams.set('state', state)
    url.searchParams.set('nonce', nonce)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set(
      'code_challenge',
      createHash('sha256').update(verifier).digest('base64url')
    )
    return url.toString()
  }

  async completeCallback(url: URL): Promise<string> {
    const state = url.searchParams.get('state') ?? ''
    const pending = this.pending.get(state)
    this.pending.delete(state)
    if (!pending || Date.now() - pending.createdAt > STATE_TTL_MS) {
      throw new Error('This shared-login attempt expired. Start again from Orca.')
    }
    const code = url.searchParams.get('code')
    if (!code || url.searchParams.has('error')) {
      throw new Error('GSD did not authorize Orca access.')
    }
    const metadata = await this.getMetadata()
    const tokenResponse = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUrl,
        code,
        code_verifier: pending.verifier
      })
    })
    if (!tokenResponse.ok) {
      throw new Error('GSD rejected the shared-login code.')
    }
    const token = (await tokenResponse.json()) as {
      access_token?: unknown
      id_token?: unknown
    }
    if (typeof token.access_token !== 'string' || !token.access_token) {
      throw new Error('GSD did not return an access token.')
    }
    const userResponse = await fetch(metadata.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    })
    // Better Auth can return the newly minted token before a subsequent
    // Cloudflare request observes its opaque-token row. The ID token came
    // directly from this PKCE exchange, so its one-time nonce, audience, and
    // expiry provide a bounded fallback instead of making the user restart.
    const user = userResponse.ok
      ? ((await userResponse.json()) as Partial<OidcUser>)
      : readDirectTokenIdentity(token.id_token, {
          clientId: this.config.clientId,
          nonce: pending.nonce
        })
    if (
      typeof user.sub !== 'string' ||
      !user.sub ||
      typeof user.email !== 'string' ||
      !user.email ||
      typeof user.email_verified !== 'boolean'
    ) {
      throw new Error('GSD returned an incomplete account identity.')
    }
    const result = this.issueIdentity(
      {
        issuer: metadata.issuer,
        sub: user.sub,
        email: user.email,
        email_verified: user.email_verified,
        ...(typeof user.name === 'string' && user.name.trim() ? { name: user.name.trim() } : {})
      },
      pending.memberKey
    )
    const target = new URL(this.config.webClientUrl)
    target.hash = `sso=${Buffer.from(JSON.stringify(result)).toString('base64url')}`
    return target.toString()
  }

  private async getMetadata(): Promise<OidcMetadata> {
    if (this.metadata) {
      return this.metadata
    }
    const response = await fetch(
      this.config.discoveryUrl ?? `${this.config.issuer}/.well-known/openid-configuration`,
      {
        headers: { Accept: 'application/json' }
      }
    )
    if (!response.ok) {
      throw new Error('GSD shared-login discovery is unavailable.')
    }
    const value = (await response.json()) as Partial<OidcMetadata>
    if (
      value.issuer !== this.config.issuer ||
      !isHttpsUrl(value.authorization_endpoint) ||
      !isHttpsUrl(value.token_endpoint) ||
      !isHttpsUrl(value.userinfo_endpoint)
    ) {
      throw new Error('GSD returned invalid shared-login metadata.')
    }
    this.metadata = value as OidcMetadata
    return this.metadata
  }

  private prunePending(): void {
    const cutoff = Date.now() - STATE_TTL_MS
    for (const [state, pending] of this.pending) {
      if (pending.createdAt < cutoff) {
        this.pending.delete(state)
      }
    }
  }
}

function readDirectTokenIdentity(
  token: unknown,
  expected: { clientId: string; nonce: string }
): Partial<OidcUser> {
  if (typeof token !== 'string') {
    throw new Error('GSD could not verify this account.')
  }
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('GSD could not verify this account.')
  }
  try {
    const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    const audience = claims.aud
    const matchesAudience =
      audience === expected.clientId ||
      (Array.isArray(audience) && audience.includes(expected.clientId))
    if (
      !matchesAudience ||
      claims.nonce !== expected.nonce ||
      typeof claims.exp !== 'number' ||
      claims.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new Error('invalid token claims')
    }
    return claims
  } catch {
    throw new Error('GSD could not verify this account.')
  }
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

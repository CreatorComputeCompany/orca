import type { MultiplayerAuthResult } from '../../../shared/multiplayer-auth-contract'
import { parseWebPairingInput } from './web-pairing'
import { WebRuntimeClient } from './web-runtime-client'
import {
  createStoredWebRuntimeEnvironment,
  getPreferredWebPairingOffer,
  readStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment,
  withWebMultiplayerIdentity
} from './web-runtime-environment'

export async function registerWebMultiplayerAccount(args: {
  displayName: string
  email: string
  password: string
}): Promise<void> {
  const current = readStoredWebRuntimeEnvironment()
  if (!current) {
    throw new Error('Connect this browser to Orca first.')
  }
  const currentOffer = getPreferredWebPairingOffer(current)
  const client = new WebRuntimeClient(currentOffer)
  try {
    const response = await client.call('multiplayer.auth.register', args)
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    await installWebMultiplayerAuth(response.result as MultiplayerAuthResult, current)
  } finally {
    client.close()
  }
}

export async function loginWebMultiplayerAccount(args: {
  email: string
  password: string
}): Promise<void> {
  const response = await fetch(multiplayerLoginUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    cache: 'no-store'
  })
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'Too many sign-in attempts. Wait a minute and try again.'
        : 'Invalid email or password.'
    )
  }
  await installWebMultiplayerAuth((await response.json()) as MultiplayerAuthResult, null)
}

export async function installWebMultiplayerAuth(
  result: MultiplayerAuthResult,
  current: ReturnType<typeof readStoredWebRuntimeEnvironment>
): Promise<void> {
  const issuedOffer = parseWebPairingInput(result.pairingUrl)
  if (!issuedOffer) {
    throw new Error('Orca returned an invalid personal access credential.')
  }
  const currentOffer = current ? getPreferredWebPairingOffer(current) : null
  const offer = {
    ...issuedOffer,
    ...(currentOffer ? { endpoint: currentOffer.endpoint } : { endpoint: sameOriginWebSocketUrl() })
  }
  const personalClient = new WebRuntimeClient(offer)
  try {
    const status = await personalClient.call('status.get', undefined, { timeoutMs: 15_000 })
    if (!status.ok) {
      throw new Error(status.error.message)
    }
  } finally {
    personalClient.close()
  }
  const refreshed = createStoredWebRuntimeEnvironment({
    name: current?.name ?? 'Orca Server',
    offer,
    previousEnvironment: current,
    ...(current?.connectionDependency ? { connectionDependency: current.connectionDependency } : {})
  })
  const environment = current
    ? {
        ...refreshed,
        id: current.id,
        createdAt: current.createdAt,
        runtimeId: current.runtimeId,
        preferredEndpointId: current.preferredEndpointId,
        endpoints: refreshed.endpoints.map((endpoint, index) => ({
          ...endpoint,
          id: index === 0 ? current.preferredEndpointId : endpoint.id
        }))
      }
    : refreshed
  saveStoredWebRuntimeEnvironment(
    withWebMultiplayerIdentity(environment, {
      memberKey: result.member.key,
      displayName: result.member.displayName,
      originalEnvironmentId: current?.id ?? environment.id,
      email: result.email
    })
  )
}

export function readWebMultiplayerSsoResult(location: Location): MultiplayerAuthResult | null {
  const value = new URLSearchParams(location.hash.replace(/^#/, '')).get('sso')
  if (!value) {
    return null
  }
  try {
    const decoded = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(toBase64(value)), (character) => character.charCodeAt(0))
      )
    ) as MultiplayerAuthResult
    if (
      typeof decoded?.pairingUrl !== 'string' ||
      typeof decoded?.email !== 'string' ||
      typeof decoded?.member?.key !== 'string' ||
      typeof decoded?.member?.displayName !== 'string'
    ) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

export function clearWebMultiplayerSsoResult(): void {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
}

export function startGsdSharedLogin(): void {
  const pathname = window.location.pathname.endsWith('web-index.html')
    ? window.location.pathname.replace(/web-index\.html$/, 'api/multiplayer/sso/start')
    : `${window.location.pathname.replace(/\/$/, '')}/api/multiplayer/sso/start`
  window.location.assign(`${window.location.origin}${pathname}`)
}

export async function linkCurrentOrcaMemberToGsd(): Promise<void> {
  const current = readStoredWebRuntimeEnvironment()
  if (!current) {
    throw new Error('Sign in to Orca before linking GSD.')
  }
  const client = new WebRuntimeClient(getPreferredWebPairingOffer(current))
  try {
    const response = await client.call('multiplayer.auth.createSsoLink', {})
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    const result = response.result as { authorizationUrl?: unknown }
    if (typeof result.authorizationUrl !== 'string') {
      throw new Error('Orca returned an invalid GSD authorization URL.')
    }
    window.location.assign(result.authorizationUrl)
  } finally {
    client.close()
  }
}

function multiplayerLoginUrl(): string {
  const pathname = window.location.pathname.endsWith('web-index.html')
    ? window.location.pathname.replace(/web-index\.html$/, 'api/multiplayer/login')
    : `${window.location.pathname.replace(/\/$/, '')}/api/multiplayer/login`
  return `${window.location.origin}${pathname}`
}

function sameOriginWebSocketUrl(): string {
  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
}

function toBase64(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  return normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
}

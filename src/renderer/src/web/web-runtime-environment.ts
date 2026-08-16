import type { PublicKnownRuntimeEnvironment } from '../../../shared/runtime-environments'
import type { WebPairingOffer } from './web-pairing'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { translate } from '@/i18n/i18n'

export type StoredWebRuntimeEnvironment = Omit<PublicKnownRuntimeEnvironment, 'endpoints'> & {
  compatibleEnvironmentIds?: string[]
  multiplayerMemberKey?: string
  multiplayerDisplayName?: string
  multiplayerOriginalEnvironmentId?: string
  endpoints: {
    id: string
    kind: 'websocket'
    label: string
    endpoint: string
    deviceToken: string
    publicKeyB64: string
  }[]
}

const ENVIRONMENT_STORAGE_KEY = 'orca.web.runtimeEnvironment.v1'
const ADDITIONAL_ENVIRONMENTS_STORAGE_KEY = 'orca.web.runtimeEnvironments.additional.v1'

export function readStoredWebRuntimeEnvironment(): StoredWebRuntimeEnvironment | null {
  const raw = window.localStorage.getItem(ENVIRONMENT_STORAGE_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as StoredWebRuntimeEnvironment
    if (
      !parsed.id ||
      !parsed.name ||
      !Array.isArray(parsed.endpoints) ||
      parsed.endpoints.length === 0
    ) {
      return null
    }
    const compatibleEnvironmentIds = Array.isArray(parsed.compatibleEnvironmentIds)
      ? parsed.compatibleEnvironmentIds.filter(
          (environmentId): environmentId is string => typeof environmentId === 'string'
        )
      : []
    const pairedDeviceId =
      typeof parsed.pairedDeviceId === 'string' && parsed.pairedDeviceId.trim().length > 0
        ? parsed.pairedDeviceId.trim()
        : null
    const {
      compatibleEnvironmentIds: _unvalidatedIds,
      pairedDeviceId: _unvalidatedDeviceId,
      ...environment
    } = parsed
    const normalized = {
      ...environment,
      ...(pairedDeviceId ? { pairedDeviceId } : {}),
      ...(compatibleEnvironmentIds.length > 0 ? { compatibleEnvironmentIds } : {})
    }
    return repairMultiplayerEnvironment(normalized)
  } catch {
    return null
  }
}

export function saveStoredWebRuntimeEnvironment(environment: StoredWebRuntimeEnvironment): void {
  window.localStorage.setItem(ENVIRONMENT_STORAGE_KEY, JSON.stringify(environment))
}

export function clearStoredWebRuntimeEnvironment(): void {
  window.localStorage.removeItem(ENVIRONMENT_STORAGE_KEY)
}

export function readAdditionalWebRuntimeEnvironments(): StoredWebRuntimeEnvironment[] {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(ADDITIONAL_ENVIRONMENTS_STORAGE_KEY) ?? '[]'
    ) as unknown
    return Array.isArray(parsed)
      ? parsed.filter(isStoredWebRuntimeEnvironment).map(normalizeStoredWebRuntimeEnvironment)
      : []
  } catch {
    return []
  }
}

export function saveAdditionalWebRuntimeEnvironment(
  environment: StoredWebRuntimeEnvironment
): void {
  const environments = readAdditionalWebRuntimeEnvironments().filter(
    (entry) => entry.id !== environment.id
  )
  window.localStorage.setItem(
    ADDITIONAL_ENVIRONMENTS_STORAGE_KEY,
    JSON.stringify([...environments, environment])
  )
}

export function removeAdditionalWebRuntimeEnvironment(environmentId: string): void {
  const environments = readAdditionalWebRuntimeEnvironments().filter(
    (entry) => entry.id !== environmentId
  )
  window.localStorage.setItem(ADDITIONAL_ENVIRONMENTS_STORAGE_KEY, JSON.stringify(environments))
}

export function createStoredWebRuntimeEnvironment(args: {
  name: string
  offer: WebPairingOffer
  previousEnvironment?: StoredWebRuntimeEnvironment | null
  connectionDependency?: 'ssh-tunnel'
}): StoredWebRuntimeEnvironment {
  const id = `web-${createBrowserUuid()}`
  const now = Date.now()
  const compatibleEnvironmentIds = getCompatibleEnvironmentIds(args.previousEnvironment, args.offer)
  return {
    id,
    name: args.name.trim() || 'Orca Server',
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    runtimeId: null,
    ...(args.offer.pairedDeviceId ? { pairedDeviceId: args.offer.pairedDeviceId } : {}),
    ...(args.connectionDependency ? { connectionDependency: args.connectionDependency } : {}),
    ...(compatibleEnvironmentIds.length > 0 ? { compatibleEnvironmentIds } : {}),
    preferredEndpointId: `ws-${id}`,
    endpoints: [
      {
        id: `ws-${id}`,
        kind: 'websocket',
        label: translate('auto.web.web.runtime.environment.07f788de83', 'WebSocket'),
        endpoint: args.offer.endpoint,
        deviceToken: args.offer.deviceToken,
        publicKeyB64: args.offer.publicKeyB64
      }
    ]
  }
}

export function withWebMultiplayerIdentity(
  environment: StoredWebRuntimeEnvironment,
  identity: { memberKey: string; displayName: string; originalEnvironmentId: string }
): StoredWebRuntimeEnvironment {
  return {
    ...environment,
    multiplayerMemberKey: identity.memberKey,
    multiplayerDisplayName: identity.displayName,
    multiplayerOriginalEnvironmentId: identity.originalEnvironmentId,
    updatedAt: Date.now()
  }
}

function repairMultiplayerEnvironment(
  environment: StoredWebRuntimeEnvironment
): StoredWebRuntimeEnvironment {
  const inferredOriginalId = environment.compatibleEnvironmentIds?.at(-1)
  const originalId = environment.multiplayerOriginalEnvironmentId ?? inferredOriginalId
  if (!environment.multiplayerMemberKey) {
    return environment
  }

  const repairedId = originalId ?? environment.id
  const preferredEndpointId = `ws-${repairedId}`
  const sameOriginEndpoint = getBoxdSameOriginEndpoint()
  const repaired = {
    ...environment,
    id: repairedId,
    ...(originalId ? { multiplayerOriginalEnvironmentId: originalId } : {}),
    preferredEndpointId,
    compatibleEnvironmentIds: environment.compatibleEnvironmentIds?.filter(
      (environmentId) => environmentId !== repairedId
    ),
    endpoints: environment.endpoints.map((endpoint, index) => ({
      ...endpoint,
      id: index === 0 ? preferredEndpointId : endpoint.id,
      // Existing spike enrollments saved the runtime's private advertised endpoint. The web app
      // and runtime are co-hosted behind Boxd, so the page origin is the known-reachable route.
      ...(index === 0 && sameOriginEndpoint ? { endpoint: sameOriginEndpoint } : {})
    }))
  }
  if (JSON.stringify(repaired) !== JSON.stringify(environment)) {
    window.localStorage.setItem(ENVIRONMENT_STORAGE_KEY, JSON.stringify(repaired))
  }
  return repaired
}

function getBoxdSameOriginEndpoint(): string | null {
  if (!window.location.hostname.endsWith('.boxd.sh')) {
    return null
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
}

function isStoredWebRuntimeEnvironment(value: unknown): value is StoredWebRuntimeEnvironment {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<StoredWebRuntimeEnvironment>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.endpoints) &&
    candidate.endpoints.length > 0
  )
}

function normalizeStoredWebRuntimeEnvironment(
  environment: StoredWebRuntimeEnvironment
): StoredWebRuntimeEnvironment {
  return {
    ...environment,
    compatibleEnvironmentIds: environment.compatibleEnvironmentIds?.filter(
      (environmentId): environmentId is string => typeof environmentId === 'string'
    )
  }
}

function getCompatibleEnvironmentIds(
  previous: StoredWebRuntimeEnvironment | null | undefined,
  offer: WebPairingOffer
): string[] {
  if (!previous?.endpoints.some((endpoint) => endpoint.publicKeyB64 === offer.publicKeyB64)) {
    return []
  }
  return [...new Set([...(previous.compatibleEnvironmentIds ?? []), previous.id])]
}

export function redactStoredWebRuntimeEnvironment(
  environment: StoredWebRuntimeEnvironment
): PublicKnownRuntimeEnvironment {
  const { compatibleEnvironmentIds: _compatibleEnvironmentIds, ...publicEnvironment } = environment
  return {
    ...publicEnvironment,
    endpoints: environment.endpoints.map(
      ({ deviceToken: _token, publicKeyB64: _key, ...rest }) => ({
        ...rest
      })
    )
  }
}

export function getPreferredWebPairingOffer(
  environment: StoredWebRuntimeEnvironment
): WebPairingOffer {
  const endpoint =
    environment.endpoints.find((entry) => entry.id === environment.preferredEndpointId) ??
    environment.endpoints[0]
  if (!endpoint) {
    throw new Error('No runtime endpoint is stored for this web client.')
  }
  return {
    v: 2,
    endpoint: endpoint.endpoint,
    deviceToken: endpoint.deviceToken,
    publicKeyB64: endpoint.publicKeyB64,
    ...(environment.pairedDeviceId ? { pairedDeviceId: environment.pairedDeviceId } : {})
  }
}

export function updateStoredEnvironmentRuntimeId(
  environment: StoredWebRuntimeEnvironment,
  runtimeId: string | null,
  pairedDeviceId?: string
): StoredWebRuntimeEnvironment {
  const next = {
    ...environment,
    runtimeId,
    ...(pairedDeviceId ? { pairedDeviceId } : {}),
    updatedAt: Date.now(),
    lastUsedAt: Date.now()
  }
  saveStoredWebRuntimeEnvironment(next)
  return next
}

export function isMixedContentWebSocket(endpoint: string): boolean {
  return window.location.protocol === 'https:' && endpoint.startsWith('ws://')
}

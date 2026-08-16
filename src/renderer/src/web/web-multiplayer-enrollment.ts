import type { MultiplayerIdentityEnrollResult } from '../../../shared/multiplayer-identity-contract'
import { parseWebPairingInput } from './web-pairing'
import { WebRuntimeClient } from './web-runtime-client'
import {
  createStoredWebRuntimeEnvironment,
  getPreferredWebPairingOffer,
  readStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment,
  withWebMultiplayerIdentity
} from './web-runtime-environment'

export async function enrollWebMultiplayerIdentity(displayName: string): Promise<void> {
  const current = readStoredWebRuntimeEnvironment()
  if (!current) {
    throw new Error('Connect this browser to Orca first.')
  }
  const currentOffer = getPreferredWebPairingOffer(current)
  const client = new WebRuntimeClient(currentOffer)
  try {
    const response = await client.call('multiplayer.identity.enroll', {
      memberKey: displayName,
      displayName
    })
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    const result = response.result as MultiplayerIdentityEnrollResult
    const issuedOffer = parseWebPairingInput(result.pairingUrl)
    if (!issuedOffer) {
      throw new Error('Orca returned an invalid personal access credential.')
    }
    // The runtime may advertise a private/Tailscale address even though this browser reached it
    // through a public reverse proxy. Credential rotation must not discard that proven route.
    const offer = { ...issuedOffer, endpoint: currentOffer.endpoint }
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
      name: current.name,
      offer,
      previousEnvironment: current,
      ...(current.connectionDependency
        ? { connectionDependency: current.connectionDependency }
        : {})
    })
    const environment = {
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
    saveStoredWebRuntimeEnvironment(
      withWebMultiplayerIdentity(environment, {
        memberKey: result.member.key,
        displayName: result.member.displayName,
        originalEnvironmentId: current.id
      })
    )
  } finally {
    client.close()
  }
}

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
  const client = new WebRuntimeClient(getPreferredWebPairingOffer(current))
  try {
    const response = await client.call('multiplayer.identity.enroll', {
      memberKey: displayName,
      displayName
    })
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    const result = response.result as MultiplayerIdentityEnrollResult
    const offer = parseWebPairingInput(result.pairingUrl)
    if (!offer) {
      throw new Error('Orca returned an invalid personal access credential.')
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

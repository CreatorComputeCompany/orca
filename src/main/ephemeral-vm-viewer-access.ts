import type {
  ManagedRuntimeOfferResult,
  ManagedRuntimePresenceResult,
  ManagedRuntimeRevokeResult
} from '../shared/managed-runtime-access-contract'
import { sendRemoteRuntimeRequest } from '../shared/remote-runtime-client'
import { getPreferredPairingOffer } from '../shared/runtime-environments'
import { resolveEnvironment } from '../shared/runtime-environment-store'
import { withEphemeralVmRecipeResultPairingCode } from '../shared/ephemeral-vm-recipes'
import type { EphemeralVmRuntimeRecord } from '../shared/ephemeral-vm-runtimes'
import type { WorkspaceCreatorProvenance } from '../shared/worktree/types'
import {
  findMultiplayerMemberByDevice,
  findMultiplayerMemberByKey,
  resolveEphemeralVmRuntimeOwnerMemberKey
} from './runtime/multiplayer-identity-store'

const VIEWER_ACCESS_TIMEOUT_MS = 15_000
const TRANSIENTLY_UNAVAILABLE_PAIRING_CODE = 'orca://pair?unavailable=transient'

export function preserveEphemeralVmViewerCatalogEntry(
  runtime: EphemeralVmRuntimeRecord
): EphemeralVmRuntimeRecord {
  return {
    ...runtime,
    viewerAccessUnavailable: true,
    // Why: the stored runtime carries the controller's pairing authority. Preserve the catalog
    // identity on a transient child failure, but never return that privileged credential.
    recipeResult: withEphemeralVmRecipeResultPairingCode(
      runtime.recipeResult,
      TRANSIENTLY_UNAVAILABLE_PAIRING_CODE
    )
  }
}
const PRESENCE_TIMEOUT_MS = 3_000

export async function projectEphemeralVmViewerAccess(args: {
  userDataPath: string
  runtime: EphemeralVmRuntimeRecord
  actor: WorkspaceCreatorProvenance
}): Promise<EphemeralVmRuntimeRecord> {
  if (
    args.actor.kind === 'host' ||
    !args.runtime.runtimeEnvironmentId ||
    args.runtime.connectionMode === 'ssh'
  ) {
    return args.runtime
  }
  const pairingCode = await createViewerPairingCode(args)
  return {
    ...args.runtime,
    recipeResult: withEphemeralVmRecipeResultPairingCode(args.runtime.recipeResult, pairingCode)
  }
}

export async function createViewerPairingCode(args: {
  userDataPath: string
  runtime: EphemeralVmRuntimeRecord
  actor: WorkspaceCreatorProvenance
}): Promise<string> {
  if (args.actor.kind !== 'paired-device' || !args.runtime.runtimeEnvironmentId) {
    throw new Error('A multiplayer member identity is required for workspace VM access.')
  }
  const member = findMultiplayerMemberByDevice(args.userDataPath, args.actor.deviceId)
  if (!member) {
    throw new Error('Enroll a multiplayer identity before opening workspace VMs.')
  }
  const response = await sendRemoteRuntimeRequest<ManagedRuntimeOfferResult>(
    getManagerPairing(args.userDataPath, args.runtime.runtimeEnvironmentId),
    'pairing.createManagedRuntimeOffer',
    { grantKey: member.key, name: `${member.displayName} workspace access` },
    VIEWER_ACCESS_TIMEOUT_MS
  )
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  return response.result.pairingUrl
}

export async function projectEphemeralVmLiveMembers(args: {
  userDataPath: string
  runtime: EphemeralVmRuntimeRecord
}): Promise<EphemeralVmRuntimeRecord> {
  if (!args.runtime.runtimeEnvironmentId || args.runtime.connectionMode === 'ssh') {
    return args.runtime
  }
  const response = await sendRemoteRuntimeRequest<ManagedRuntimePresenceResult>(
    getManagerPairing(args.userDataPath, args.runtime.runtimeEnvironmentId),
    'pairing.listManagedRuntimePresence',
    undefined,
    PRESENCE_TIMEOUT_MS
  )
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  const liveMembers = response.result.members.flatMap(({ grantKey, worktreeId }) => {
    const member = findMultiplayerMemberByKey(args.userDataPath, grantKey)
    return member ? [{ key: member.key, displayName: member.displayName, worktreeId }] : []
  })
  return { ...args.runtime, liveMembers }
}

export async function revokeNonOwnerViewerAccess(args: {
  userDataPath: string
  runtime: EphemeralVmRuntimeRecord
}): Promise<void> {
  if (!args.runtime.runtimeEnvironmentId || args.runtime.connectionMode === 'ssh') {
    return
  }
  const ownerMemberKey = resolveEphemeralVmRuntimeOwnerMemberKey(args.userDataPath, args.runtime)
  if (!ownerMemberKey) {
    throw new Error('Workspace VM owner is not enrolled.')
  }
  const response = await sendRemoteRuntimeRequest<ManagedRuntimeRevokeResult>(
    getManagerPairing(args.userDataPath, args.runtime.runtimeEnvironmentId),
    'pairing.revokeManagedRuntimeAccess',
    { retainGrantKeys: [ownerMemberKey] },
    VIEWER_ACCESS_TIMEOUT_MS
  )
  if (!response.ok) {
    throw new Error(response.error.message)
  }
}

function getManagerPairing(userDataPath: string, runtimeEnvironmentId: string) {
  return getPreferredPairingOffer(resolveEnvironment(userDataPath, runtimeEnvironmentId))
}

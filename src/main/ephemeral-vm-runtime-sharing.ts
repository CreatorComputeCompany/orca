import {
  listEphemeralVmRuntimes,
  updateEphemeralVmRuntimeStatus
} from '../shared/ephemeral-vm-runtime-store'
import type {
  EphemeralVmRuntimeRecord,
  EphemeralVmWorkspaceSharing
} from '../shared/ephemeral-vm-runtimes'
import type { WorkspaceCreatorProvenance } from '../shared/worktree/types'
import {
  devicesBelongToSameMember,
  findMultiplayerMemberByDevice,
  resolveEphemeralVmRuntimeOwnerMemberKey
} from './runtime/multiplayer-identity-store'

export function setEphemeralVmRuntimeSharing(args: {
  userDataPath: string
  runtimeEnvironmentId: string
  sharing: EphemeralVmWorkspaceSharing
  actor: WorkspaceCreatorProvenance
}): EphemeralVmRuntimeRecord {
  const runtime = assertEphemeralVmRuntimeSharingActor(args)
  return updateEphemeralVmRuntimeStatus(args.userDataPath, runtime.id, {
    sharing: args.sharing
  })
}

export function assertEphemeralVmRuntimeSharingActor(args: {
  userDataPath: string
  runtimeEnvironmentId: string
  actor: WorkspaceCreatorProvenance
}): EphemeralVmRuntimeRecord {
  const runtime = listEphemeralVmRuntimes(args.userDataPath).find(
    (entry) => entry.runtimeEnvironmentId === args.runtimeEnvironmentId
  )
  if (!runtime) {
    throw new Error(`Unknown ephemeral VM environment: ${args.runtimeEnvironmentId}`)
  }
  if (!sameOwner(args.userDataPath, runtime, args.actor)) {
    throw new Error('Only the workspace owner can change sharing.')
  }
  return runtime
}

function sameOwner(
  userDataPath: string,
  runtime: EphemeralVmRuntimeRecord,
  actor: WorkspaceCreatorProvenance
): boolean {
  if (actor.kind === 'host') {
    return runtime.creatorProvenance?.kind === 'host'
  }
  const ownerMemberKey = resolveEphemeralVmRuntimeOwnerMemberKey(userDataPath, runtime)
  if (ownerMemberKey) {
    return findMultiplayerMemberByDevice(userDataPath, actor.deviceId)?.key === ownerMemberKey
  }
  const creator = runtime.creatorProvenance
  if (!creator || creator.kind !== actor.kind) {
    return false
  }
  return (
    creator.kind === 'paired-device' &&
    devicesBelongToSameMember(userDataPath, creator.deviceId, actor.deviceId)
  )
}

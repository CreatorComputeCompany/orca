import {
  listEphemeralVmRuntimes,
  updateEphemeralVmRuntimeStatus
} from '../shared/ephemeral-vm-runtime-store'
import type {
  EphemeralVmRuntimeRecord,
  EphemeralVmWorkspaceSharing
} from '../shared/ephemeral-vm-runtimes'
import type { WorkspaceCreatorProvenance } from '../shared/worktree/types'

export function setEphemeralVmRuntimeSharing(args: {
  userDataPath: string
  runtimeEnvironmentId: string
  sharing: EphemeralVmWorkspaceSharing
  actor: WorkspaceCreatorProvenance
}): EphemeralVmRuntimeRecord {
  const runtime = listEphemeralVmRuntimes(args.userDataPath).find(
    (entry) => entry.runtimeEnvironmentId === args.runtimeEnvironmentId
  )
  if (!runtime) {
    throw new Error(`Unknown ephemeral VM environment: ${args.runtimeEnvironmentId}`)
  }
  if (!sameCreator(runtime.creatorProvenance, args.actor)) {
    throw new Error('Only the workspace creator can change sharing.')
  }
  return updateEphemeralVmRuntimeStatus(args.userDataPath, runtime.id, {
    sharing: args.sharing
  })
}

function sameCreator(
  creator: WorkspaceCreatorProvenance | undefined,
  actor: WorkspaceCreatorProvenance
): boolean {
  if (!creator || creator.kind !== actor.kind) {
    return false
  }
  if (creator.kind === 'host') {
    return true
  }
  return actor.kind === 'paired-device' && creator.deviceId === actor.deviceId
}

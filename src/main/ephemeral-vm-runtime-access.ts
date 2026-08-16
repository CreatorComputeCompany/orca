import { listEphemeralVmRuntimes } from '../shared/ephemeral-vm-runtime-store'
import type { WorkspaceCreatorProvenance } from '../shared/worktree/types'
import { canDeviceAccessEphemeralVmRuntime } from './runtime/multiplayer-identity-store'

export function assertEphemeralVmRuntimeAccess(args: {
  userDataPath: string
  actor: WorkspaceCreatorProvenance
  runtimeId?: string
  workspaceId?: string
}): void {
  if (args.actor.kind === 'host') {
    return
  }
  const runtime = listEphemeralVmRuntimes(args.userDataPath).find(
    (entry) =>
      (args.runtimeId && entry.id === args.runtimeId) ||
      (args.workspaceId && entry.workspaceId === args.workspaceId)
  )
  if (
    !runtime ||
    !canDeviceAccessEphemeralVmRuntime(args.userDataPath, args.actor.deviceId, runtime)
  ) {
    throw new Error('This workspace is private to another teammate.')
  }
}

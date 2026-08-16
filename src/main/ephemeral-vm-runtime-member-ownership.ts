import {
  listEphemeralVmRuntimes,
  updateEphemeralVmRuntimeStatus
} from '../shared/ephemeral-vm-runtime-store'
import { resolveEphemeralVmRuntimeOwnerMemberKey } from './runtime/multiplayer-identity-store'

/** Backfill stable account ownership when a legacy creator device is now enrolled. */
export function migrateEphemeralVmRuntimeMemberOwnership(userDataPath: string): number {
  let migrated = 0
  for (const runtime of listEphemeralVmRuntimes(userDataPath)) {
    if (runtime.ownerMemberKey) {
      continue
    }
    const ownerMemberKey = resolveEphemeralVmRuntimeOwnerMemberKey(userDataPath, runtime)
    if (!ownerMemberKey) {
      continue
    }
    updateEphemeralVmRuntimeStatus(userDataPath, runtime.id, { ownerMemberKey })
    migrated += 1
  }
  return migrated
}

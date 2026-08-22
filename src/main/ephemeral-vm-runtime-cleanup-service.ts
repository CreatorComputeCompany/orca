import type { Store } from './persistence'
import {
  listEphemeralVmRuntimes,
  updateEphemeralVmRuntimeStatus
} from '../shared/ephemeral-vm-runtime-store'
import type { EphemeralVmRuntimeRecord } from '../shared/ephemeral-vm-runtimes'
import { removeEnvironment } from '../shared/runtime-environment-store'
import { cleanupEphemeralVmRuntime } from './ephemeral-vm-runtime-service'
import { removeEphemeralVmRuntimeSshTarget } from './ephemeral-vm-runtime-ssh-cleanup'
import { removeRuntimeOwnedSshTarget } from './ephemeral-vm-runtime-ssh'
import { getRuntimeRecipeContext } from './ipc/ephemeral-vm-recipe-context'

export async function cleanupEphemeralVmRuntimeRecord(
  store: Store,
  userDataPath: string,
  args: { runtimeId: string }
): Promise<EphemeralVmRuntimeRecord> {
  const runtime = listEphemeralVmRuntimes(userDataPath).find((entry) => entry.id === args.runtimeId)
  if (!runtime) {
    throw new Error(`Unknown ephemeral VM runtime: ${args.runtimeId}`)
  }
  if (!runtime.repoId) {
    throw new Error(`Ephemeral VM runtime has no repo id: ${args.runtimeId}`)
  }
  let result
  if (runtime.cleanupStatus === 'succeeded') {
    result = { ok: true as const, runtime, skipped: false }
  } else {
    let resolved: ReturnType<typeof getRuntimeRecipeContext>
    try {
      resolved = getRuntimeRecipeContext(store, userDataPath, runtime.id)
    } catch (error) {
      const failed = updateEphemeralVmRuntimeStatus(userDataPath, runtime.id, {
        status: 'cleanup_failed',
        cleanupStatus: 'failed',
        cleanupLastAttemptAt: Date.now(),
        cleanupLastError: error instanceof Error ? error.message : String(error)
      })
      return removeEphemeralVmRuntimeSshTarget({
        userDataPath,
        runtime: failed,
        removeTarget: removeRuntimeOwnedSshTarget
      })
    }
    result = await cleanupEphemeralVmRuntime({
      userDataPath,
      repoPath: resolved.repo.repo.path,
      recipe: resolved.recipe,
      runtimeId: runtime.id
    })
  }
  if (result.ok && runtime.runtimeEnvironmentId) {
    try {
      removeEnvironment(userDataPath, runtime.runtimeEnvironmentId)
    } catch {
      // Provider cleanup succeeded; a stale saved-environment row can be removed manually.
    }
  }
  if (!result.ok) {
    return result.runtime
  }
  return removeEphemeralVmRuntimeSshTarget({
    userDataPath,
    runtime: result.runtime,
    removeTarget: removeRuntimeOwnedSshTarget
  })
}

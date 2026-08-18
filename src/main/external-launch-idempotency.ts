import { listEphemeralVmRuntimes } from '../shared/ephemeral-vm-runtime-store'
import type { EphemeralVmRuntimeRecord } from '../shared/ephemeral-vm-runtimes'
import { getEphemeralVmRecipeResultWarnings } from '../shared/ephemeral-vm-recipe-diagnostics'
import { getEphemeralVmRecipeResultConnection } from '../shared/ephemeral-vm-recipes'
import { resolveEnvironment } from '../shared/runtime-environment-store'
import { redactRuntimeEnvironment } from '../shared/runtime-environments'

const activeExternalLaunches = new Map<string, Promise<unknown>>()

export async function runIdempotentExternalLaunch<T>(
  externalLaunchId: string | undefined,
  launch: () => Promise<T>
): Promise<T> {
  if (!externalLaunchId) {
    return launch()
  }
  const active = activeExternalLaunches.get(externalLaunchId) as Promise<T> | undefined
  if (active) {
    return active
  }
  const pending = launch()
  activeExternalLaunches.set(externalLaunchId, pending)
  try {
    return await pending
  } finally {
    if (activeExternalLaunches.get(externalLaunchId) === pending) {
      activeExternalLaunches.delete(externalLaunchId)
    }
  }
}

export function findActiveExternalLaunchRuntime(args: {
  userDataPath: string
  externalLaunchId?: string
  ownerMemberKey?: string
}): EphemeralVmRuntimeRecord | undefined {
  if (!args.externalLaunchId) {
    return undefined
  }
  return listEphemeralVmRuntimes(args.userDataPath).find(
    (runtime) =>
      runtime.externalLaunchId === args.externalLaunchId &&
      runtime.status !== 'cleaned' &&
      runtime.status !== 'failed' &&
      (!args.ownerMemberKey || runtime.ownerMemberKey === args.ownerMemberKey)
  )
}

export function resolveExistingExternalLaunch(args: {
  userDataPath: string
  externalLaunchId?: string
  ownerMemberKey?: string
}):
  | { kind: 'none' }
  | { kind: 'pending' }
  | {
      kind: 'ready'
      runtime: EphemeralVmRuntimeRecord
      environment: ReturnType<typeof redactRuntimeEnvironment>
      pairingCode: string
      warnings: ReturnType<typeof getEphemeralVmRecipeResultWarnings>
    } {
  const runtime = findActiveExternalLaunchRuntime(args)
  if (!runtime) {
    return { kind: 'none' }
  }
  if (runtime.runtimeEnvironmentId) {
    const connection = getEphemeralVmRecipeResultConnection(runtime.recipeResult)
    if (connection.type === 'orca-server') {
      return {
        kind: 'ready',
        runtime,
        environment: redactRuntimeEnvironment(
          resolveEnvironment(args.userDataPath, runtime.runtimeEnvironmentId)
        ),
        pairingCode: connection.pairingCode,
        warnings: getEphemeralVmRecipeResultWarnings(runtime.recipeResult)
      }
    }
  }
  return { kind: 'pending' }
}

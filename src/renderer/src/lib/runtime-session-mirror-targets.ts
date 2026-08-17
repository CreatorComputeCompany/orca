import type { WorktreeRuntimeOwnerState } from './worktree-runtime-owner-state'
import { getRuntimeSessionMirrorEnvironmentIds } from './runtime-session-mirror-owners'

type RuntimeMirrorStatus = {
  status: { runtimeId: string } | null
  connectionGeneration?: number
}

type RuntimeMirrorEnvironment = {
  id: string
  createdAt: number
  pairingRevision?: number
  runtimeId?: string | null
  source?: 'manual' | 'ephemeral-vm'
}

export type RuntimeSessionMirrorTarget = {
  environmentId: string
  runtimeId: string
  connectionGeneration: number
  pairingRevision: number
}

export type RuntimeSessionMirrorTargetState = Omit<
  WorktreeRuntimeOwnerState,
  'runtimeEnvironments'
> & {
  runtimeEnvironments?: readonly RuntimeMirrorEnvironment[]
  runtimeStatusByEnvironmentId?: ReadonlyMap<string, RuntimeMirrorStatus>
}

export function getReachableRuntimeSessionMirrorTargets(
  state: RuntimeSessionMirrorTargetState
): RuntimeSessionMirrorTarget[] {
  const environmentById = new Map(
    (state.runtimeEnvironments ?? []).map((environment) => [environment.id, environment])
  )
  const environmentIds = new Set(getRuntimeSessionMirrorEnvironmentIds(state))
  // Why: controller discovery is already the authorization boundary for workspace VMs. Requiring
  // a separate renderer status-map write before subscribing creates a circular startup gate: the
  // selected VM stays black even though its member offer is valid. Inaccessible VMs are pruned
  // from this catalog, so attempting every discovered ephemeral VM remains fail-closed.
  for (const environment of state.runtimeEnvironments ?? []) {
    if (environment.source === 'ephemeral-vm') {
      environmentIds.add(environment.id)
    }
  }
  const targets: RuntimeSessionMirrorTarget[] = []
  for (const environmentId of [...environmentIds].sort()) {
    const status = state.runtimeStatusByEnvironmentId?.get(environmentId)
    const environment = environmentById.get(environmentId)
    if (!environment) {
      continue
    }
    if (!status?.status && environment.source !== 'ephemeral-vm') {
      continue
    }
    targets.push({
      environmentId,
      runtimeId: status?.status?.runtimeId ?? environment.runtimeId ?? `ephemeral:${environmentId}`,
      connectionGeneration: status?.connectionGeneration ?? 0,
      pairingRevision: environment.pairingRevision ?? environment.createdAt
    })
  }
  return targets
}

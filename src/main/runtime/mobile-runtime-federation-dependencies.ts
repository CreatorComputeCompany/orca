import { listEphemeralVmRuntimes } from '../../shared/ephemeral-vm-runtime-store'
import type { RemoteRuntimeSubscription } from '../../shared/remote-runtime-client'
import type { RuntimeRpcResponse } from '../../shared/runtime-rpc-envelope'
import { listEnvironments } from '../../shared/runtime-environment-store'
import {
  callRuntimeEnvironment,
  subscribeRuntimeEnvironment
} from '../ipc/runtime-environment-transport-routing'

const CHILD_RUNTIME_TIMEOUT_MS = 60_000

export type ChildRuntimeTarget = {
  environmentId: string
  workspaceId: string
}

export type MobileRuntimeFederationDependencies = {
  listTargets: () => ChildRuntimeTarget[]
  call: (
    environmentId: string,
    method: string,
    params: unknown
  ) => Promise<RuntimeRpcResponse<unknown>>
  subscribe: (
    environmentId: string,
    method: string,
    params: unknown,
    callbacks: {
      onEvent: Parameters<typeof subscribeRuntimeEnvironment>[5]['onEvent']
      onClose: () => void
    }
  ) => Promise<RemoteRuntimeSubscription>
}

export function createMobileRuntimeFederationDependencies(
  userDataPath: string
): MobileRuntimeFederationDependencies {
  return {
    listTargets: () => listChildRuntimeTargets(userDataPath),
    call: (environmentId, method, params) =>
      callRuntimeEnvironment(userDataPath, environmentId, method, params, CHILD_RUNTIME_TIMEOUT_MS),
    subscribe: (environmentId, method, params, callbacks) =>
      subscribeRuntimeEnvironment(
        userDataPath,
        environmentId,
        method,
        params,
        CHILD_RUNTIME_TIMEOUT_MS,
        callbacks
      )
  }
}

function listChildRuntimeTargets(userDataPath: string): ChildRuntimeTarget[] {
  const environmentIds = new Set(
    listEnvironments(userDataPath)
      .filter(({ source }) => source === 'ephemeral-vm')
      .map(({ id }) => id)
  )
  return listEphemeralVmRuntimes(userDataPath)
    .filter(
      (
        runtime
      ): runtime is typeof runtime & {
        runtimeEnvironmentId: string
        workspaceId: string
      } =>
        runtime.status === 'running' &&
        Boolean(runtime.runtimeEnvironmentId) &&
        Boolean(runtime.workspaceId) &&
        environmentIds.has(runtime.runtimeEnvironmentId!)
    )
    .map((runtime) => ({
      environmentId: runtime.runtimeEnvironmentId,
      workspaceId: runtime.workspaceId
    }))
}

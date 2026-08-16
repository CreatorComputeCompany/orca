import { z } from 'zod'
import type { EphemeralVmRecipeDoctorResult } from '../../../../shared/ephemeral-vm-recipes'
import type {
  EphemeralVmRuntimeRecord,
  EphemeralVmWorkspaceSharing
} from '../../../../shared/ephemeral-vm-runtimes'
import { EphemeralVmWorkspaceSharingSchema } from '../../../../shared/ephemeral-vm-runtimes'
import type {
  EphemeralVmRecipeCatalogEntry,
  EphemeralVmRecipeListResult
} from '../../../ipc/ephemeral-vm-recipe-context'
import type {
  EphemeralVmProvisionArgs,
  EphemeralVmProvisionRpcResult
} from '../../../ephemeral-vm-controller-service'
import { defineMethod, type RpcMethod } from '../core'
import { resolveRpcWorkspaceCreatorProvenance } from '../workspace-creator-context'

export type EphemeralVmRpcReadService = {
  listRecipes(args: { repoId: string }): Promise<EphemeralVmRecipeListResult>
  listRecipeCatalog(): Promise<EphemeralVmRecipeCatalogEntry[]>
  doctor(args: { repoId: string; recipeId: string }): Promise<EphemeralVmRecipeDoctorResult>
  listRuntimes(
    actor: ReturnType<typeof resolveRpcWorkspaceCreatorProvenance>
  ): Promise<EphemeralVmRuntimeRecord[]>
  provision(args: EphemeralVmProvisionArgs): Promise<EphemeralVmProvisionRpcResult>
  cancelProvision(args: { provisionId: string }): Promise<{ cancelled: boolean }>
  attachWorkspace(args: {
    runtimeId: string
    workspaceId: string
    actor: ReturnType<typeof resolveRpcWorkspaceCreatorProvenance>
  }): Promise<EphemeralVmRuntimeRecord>
  cleanup(args: {
    runtimeId: string
    actor: ReturnType<typeof resolveRpcWorkspaceCreatorProvenance>
  }): Promise<EphemeralVmRuntimeRecord>
  resumeWorkspace(args: {
    workspaceId: string
    actor: ReturnType<typeof resolveRpcWorkspaceCreatorProvenance>
  }): Promise<EphemeralVmRuntimeRecord | null>
  setSharing(args: {
    runtimeEnvironmentId: string
    sharing: EphemeralVmWorkspaceSharing
    actor: ReturnType<typeof resolveRpcWorkspaceCreatorProvenance>
  }): Promise<EphemeralVmRuntimeRecord>
}

let service: EphemeralVmRpcReadService | null = null

export function setEphemeralVmRpcReadService(next: EphemeralVmRpcReadService | null): void {
  service = next
}

function requireService(): EphemeralVmRpcReadService {
  if (!service) {
    throw new Error('Ephemeral VM service is not available on this runtime')
  }
  return service
}

const RepoIdParams = z.object({ repoId: z.string().min(1) })
const DoctorParams = RepoIdParams.extend({ recipeId: z.string().min(1) })
const ProvisionParams = DoctorParams.extend({
  workspaceName: z.string().optional(),
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
  branch: z.string().optional(),
  ref: z.string().optional(),
  provisionId: z.string().optional()
})
const CancelProvisionParams = z.object({ provisionId: z.string().min(1) })
const RuntimeIdParams = z.object({ runtimeId: z.string().min(1) })
const AttachWorkspaceParams = RuntimeIdParams.extend({ workspaceId: z.string().min(1) })
const WorkspaceIdParams = z.object({ workspaceId: z.string().min(1) })
const SetSharingParams = z.object({
  runtimeEnvironmentId: z.string().min(1),
  sharing: EphemeralVmWorkspaceSharingSchema
})

export const EPHEMERAL_VM_METHODS: readonly RpcMethod[] = [
  defineMethod({
    name: 'ephemeralVm.listRecipes',
    params: RepoIdParams,
    handler: (params) => requireService().listRecipes(params)
  }),
  defineMethod({
    name: 'ephemeralVm.listRecipeCatalog',
    params: null,
    handler: () => requireService().listRecipeCatalog()
  }),
  defineMethod({
    name: 'ephemeralVm.doctor',
    params: DoctorParams,
    handler: (params) => requireService().doctor(params)
  }),
  defineMethod({
    name: 'ephemeralVm.listRuntimes',
    params: null,
    handler: (_params, context) =>
      requireService().listRuntimes(resolveRpcWorkspaceCreatorProvenance(context))
  }),
  defineMethod({
    name: 'ephemeralVm.setSharing',
    params: SetSharingParams,
    handler: (params, context) =>
      requireService().setSharing({
        ...params,
        actor: resolveRpcWorkspaceCreatorProvenance(context)
      })
  }),
  defineMethod({
    name: 'ephemeralVm.provision',
    params: ProvisionParams,
    handler: (params, context) =>
      requireService().provision({
        ...params,
        creatorProvenance: resolveRpcWorkspaceCreatorProvenance(context)
      })
  }),
  defineMethod({
    name: 'ephemeralVm.cancelProvision',
    params: CancelProvisionParams,
    handler: (params) => requireService().cancelProvision(params)
  }),
  defineMethod({
    name: 'ephemeralVm.attachWorkspace',
    params: AttachWorkspaceParams,
    handler: (params, context) =>
      requireService().attachWorkspace({
        ...params,
        actor: resolveRpcWorkspaceCreatorProvenance(context)
      })
  }),
  defineMethod({
    name: 'ephemeralVm.cleanup',
    params: RuntimeIdParams,
    handler: (params, context) =>
      requireService().cleanup({
        ...params,
        actor: resolveRpcWorkspaceCreatorProvenance(context)
      })
  }),
  defineMethod({
    name: 'ephemeralVm.resumeWorkspace',
    params: WorkspaceIdParams,
    handler: (params, context) =>
      requireService().resumeWorkspace({
        ...params,
        actor: resolveRpcWorkspaceCreatorProvenance(context)
      })
  })
]

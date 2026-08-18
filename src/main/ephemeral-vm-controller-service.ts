import type { Store } from './persistence'
import {
  getEphemeralVmRecipeResultConnection,
  type EphemeralVmRecipeDoctorResult
} from '../shared/ephemeral-vm-recipes'
import {
  getEphemeralVmRecipeResultWarnings,
  redactEphemeralVmRecipeDiagnosticText,
  type EphemeralVmRecipeResultWarning
} from '../shared/ephemeral-vm-recipe-diagnostics'
import { getProvisionedRootRecipeRepoUrl } from '../shared/ephemeral-vm-recipe-repo-url'
import { doctorEphemeralVmRecipe } from '../shared/ephemeral-vm-recipe-doctor'
import { updateEphemeralVmRuntimeStatus } from '../shared/ephemeral-vm-runtime-store'
import type { EphemeralVmRuntimeRecord } from '../shared/ephemeral-vm-runtimes'
import { addEnvironmentFromPairingCode } from '../shared/runtime-environment-store'
import {
  redactRuntimeEnvironment,
  type PublicKnownRuntimeEnvironment
} from '../shared/runtime-environments'
import {
  cleanupEphemeralVmRuntime,
  provisionEphemeralVmRuntime
} from './ephemeral-vm-runtime-service'
import { connectRuntimeOwnedSshTarget } from './ephemeral-vm-runtime-ssh'
import {
  getRecipeRepo,
  listRecipeCatalog,
  listRecipes,
  resolveRecipeForRepo,
  type EphemeralVmRecipeCatalogEntry
} from './ipc/ephemeral-vm-recipe-context'
import type { PluginService } from './plugins/plugin-service'
import { getApprovedPluginVmRecipes } from './plugins/plugin-approved-vm-recipes'
import { resolveProvisionedRootSource } from './ephemeral-vm-provisioned-root-source'
import type { WorkspaceCreatorProvenance } from '../shared/worktree/types'
import { resolveEphemeralVmProvisionRepo } from './ephemeral-vm-provision-repo'
import {
  resolveExistingExternalLaunch,
  runIdempotentExternalLaunch
} from './external-launch-idempotency'

const activeProvisionControllers = new Map<string, AbortController>()
export async function listEphemeralVmRecipes(
  store: Store,
  pluginService: PluginService | undefined,
  args: { repoId: string }
): Promise<ReturnType<typeof listRecipes>> {
  return listRecipes(store, args.repoId, await getApprovedPluginVmRecipes(pluginService))
}

export async function listEphemeralVmRecipeCatalog(
  store: Store,
  pluginService?: PluginService
): Promise<EphemeralVmRecipeCatalogEntry[]> {
  return listRecipeCatalog(store, await getApprovedPluginVmRecipes(pluginService))
}

export async function doctorEphemeralVm(
  store: Store,
  pluginService: PluginService | undefined,
  args: { repoId: string; recipeId: string }
): Promise<EphemeralVmRecipeDoctorResult> {
  const repo = getRecipeRepo(store, args.repoId)
  if (!repo.ok) {
    return repo.doctor(args.recipeId)
  }
  const pluginRecipes = await getApprovedPluginVmRecipes(pluginService)
  return doctorEphemeralVmRecipe({
    repoPath: repo.repo.path,
    recipeId: args.recipeId,
    recipes: listRecipes(store, args.repoId, pluginRecipes).recipes,
    localExecutionSupported: true
  })
}

export type EphemeralVmProvisionIpcResult =
  | {
      ok: true
      connectionType: 'orca-server'
      runtime: EphemeralVmRuntimeRecord
      environment: PublicKnownRuntimeEnvironment
      stderr: string
      warnings: EphemeralVmRecipeResultWarning[]
    }
  | {
      ok: true
      connectionType: 'ssh'
      runtime: EphemeralVmRuntimeRecord
      sshTargetId: string
      expectedRefHead?: string
      stderr: string
      warnings: EphemeralVmRecipeResultWarning[]
    }
  | {
      ok: false
      error: string
      stderr: string
      stdout: string
    }

export type EphemeralVmProvisionArgs = {
  repoId: string
  recipeId: string
  workspaceName?: string
  projectId?: string
  workspaceId?: string
  branch?: string
  ref?: string
  provisionId?: string
  creatorProvenance?: WorkspaceCreatorProvenance
  ownerMemberKey?: string
  externalLaunchId?: string
}

export type EphemeralVmProvisionRpcResult =
  | (Extract<EphemeralVmProvisionIpcResult, { ok: true; connectionType: 'orca-server' }> & {
      pairingCode: string
    })
  | Exclude<EphemeralVmProvisionIpcResult, { ok: true; connectionType: 'orca-server' }>

export async function provisionEphemeralVmForRpc(
  store: Store,
  pluginService: PluginService | undefined,
  userDataPath: string,
  args: EphemeralVmProvisionArgs
): Promise<EphemeralVmProvisionRpcResult> {
  return runIdempotentExternalLaunch(args.externalLaunchId, () =>
    provisionEphemeralVmForRpcOnce(store, pluginService, userDataPath, args)
  )
}

async function provisionEphemeralVmForRpcOnce(
  store: Store,
  pluginService: PluginService | undefined,
  userDataPath: string,
  args: EphemeralVmProvisionArgs
): Promise<EphemeralVmProvisionRpcResult> {
  const existing = resolveExistingExternalLaunch({
    userDataPath,
    externalLaunchId: args.externalLaunchId,
    ownerMemberKey: args.ownerMemberKey
  })
  if (existing.kind === 'ready') {
    return { ok: true, connectionType: 'orca-server', ...existing, stderr: '' }
  }
  if (existing.kind === 'pending') {
    return {
      ok: false,
      error: 'This GSD card already has a workspace VM being prepared.',
      stdout: '',
      stderr: ''
    }
  }
  const repo = resolveEphemeralVmProvisionRepo(store, args)
  if (!repo.ok) {
    return { ok: false, error: repo.message, stdout: '', stderr: '' }
  }
  const recipe = resolveRecipeForRepo(
    repo.repo.path,
    args.recipeId,
    await getApprovedPluginVmRecipes(pluginService)
  )
  if (!recipe) {
    return { ok: false, error: `Recipe not found: ${args.recipeId}`, stdout: '', stderr: '' }
  }
  const controller = args.provisionId ? new AbortController() : null
  if (args.provisionId && controller) {
    activeProvisionControllers.set(args.provisionId, controller)
  }
  try {
    let recipeRepoUrl = repo.repo.gitRemoteIdentity?.remoteUrl
    let sourceRef = args.ref
    let expectedRefHead: string | undefined
    if (recipe.checkoutMode === 'provisioned-root') {
      const source = await resolveProvisionedRootSource(
        store,
        repo.repo,
        args.ref,
        controller?.signal
      )
      if (controller?.signal.aborted) {
        return { ok: false, error: 'Provisioning cancelled.', stdout: '', stderr: '' }
      }
      if (!source) {
        return {
          ok: false,
          error: args.ref
            ? `Could not resolve provisioned-root start ref: ${args.ref}`
            : 'Could not resolve a default provisioned-root start ref.',
          stdout: '',
          stderr: ''
        }
      }
      sourceRef = source.ref
      expectedRefHead = source.head
      recipeRepoUrl = source.remoteUrl ?? recipeRepoUrl
    }
    const repoUrl = getProvisionedRootRecipeRepoUrl(recipe.checkoutMode, recipeRepoUrl)
    const result = await provisionEphemeralVmRuntime({
      userDataPath,
      repoPath: repo.repo.path,
      repoId: repo.repo.id,
      recipe,
      projectId: args.projectId,
      workspaceId: args.workspaceId,
      workspaceName: args.workspaceName,
      externalLaunchId: args.externalLaunchId,
      creatorProvenance: args.creatorProvenance,
      ownerMemberKey: args.ownerMemberKey,
      ...(repoUrl ? { repoUrl } : {}),
      ...(args.branch ? { branch: args.branch } : {}),
      ...(sourceRef ? { ref: sourceRef } : {}),
      ...(expectedRefHead ? { expectedRefHead } : {}),
      ...(controller ? { signal: controller.signal } : {})
    })
    if (!result.ok) {
      return {
        ok: false,
        error: result.start.error,
        stdout: redactEphemeralVmRecipeDiagnosticText(result.start.stdout),
        stderr: redactEphemeralVmRecipeDiagnosticText(result.start.stderr)
      }
    }
    const connection = getEphemeralVmRecipeResultConnection(result.start.result)
    if (connection.type === 'ssh') {
      try {
        const ssh = await connectRuntimeOwnedSshTarget({
          runtimeId: result.runtime.id,
          connection,
          ...(controller ? { signal: controller.signal } : {})
        })
        const runtime = updateEphemeralVmRuntimeStatus(userDataPath, result.runtime.id, {
          sshTargetId: ssh.targetId
        })
        return {
          ok: true,
          connectionType: 'ssh',
          runtime,
          sshTargetId: ssh.targetId,
          ...(expectedRefHead ? { expectedRefHead } : {}),
          stderr: redactEphemeralVmRecipeDiagnosticText(result.start.stderr),
          warnings: getEphemeralVmRecipeResultWarnings(result.start.result)
        }
      } catch (error) {
        await cleanupEphemeralVmRuntime({
          userDataPath,
          repoPath: repo.repo.path,
          recipe,
          runtimeId: result.runtime.id
        }).catch(() => undefined)
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          stdout: redactEphemeralVmRecipeDiagnosticText(result.start.stdout),
          stderr: redactEphemeralVmRecipeDiagnosticText(result.start.stderr)
        }
      }
    }

    let environment: ReturnType<typeof addEnvironmentFromPairingCode>
    try {
      environment = addEnvironmentFromPairingCode(userDataPath, {
        name: `${repo.repo.displayName} VM ${result.runtime.id.slice(-8)}`,
        pairingCode: connection.pairingCode,
        source: 'ephemeral-vm'
      })
    } catch (error) {
      await cleanupEphemeralVmRuntime({
        userDataPath,
        repoPath: repo.repo.path,
        recipe,
        runtimeId: result.runtime.id
      }).catch(() => undefined)
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        stdout: redactEphemeralVmRecipeDiagnosticText(result.start.stdout),
        stderr: redactEphemeralVmRecipeDiagnosticText(result.start.stderr)
      }
    }
    const runtime = updateEphemeralVmRuntimeStatus(userDataPath, result.runtime.id, {
      runtimeEnvironmentId: environment.id
    })
    return {
      ok: true,
      connectionType: 'orca-server',
      runtime,
      environment: redactRuntimeEnvironment(environment),
      pairingCode: connection.pairingCode,
      stderr: redactEphemeralVmRecipeDiagnosticText(result.start.stderr),
      warnings: getEphemeralVmRecipeResultWarnings(result.start.result)
    }
  } finally {
    if (args.provisionId) {
      activeProvisionControllers.delete(args.provisionId)
    }
  }
}

export function cancelEphemeralVmProvision(args: { provisionId: string }): {
  cancelled: boolean
} {
  const controller = activeProvisionControllers.get(args.provisionId)
  if (!controller) {
    return { cancelled: false }
  }
  controller.abort()
  activeProvisionControllers.delete(args.provisionId)
  return { cancelled: true }
}

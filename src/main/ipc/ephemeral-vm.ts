import { app, ipcMain } from 'electron'
import type { Store } from '../persistence'
import {
  getEphemeralVmRecipeResultConnection,
  type EphemeralVmRecipeDoctorResult
} from '../../shared/ephemeral-vm-recipes'
import {
  getEphemeralVmRecipeResultWarnings,
  redactEphemeralVmRecipeDiagnosticText
} from '../../shared/ephemeral-vm-recipe-diagnostics'
import { getProvisionedRootRecipeRepoUrl } from '../../shared/ephemeral-vm-recipe-repo-url'
// Why: import directly from the doctor module (not the barrel) — it uses Node
// fs/path and must stay out of the browser bundle that imports the barrel.
import { updateEphemeralVmRuntimeStatus } from '../../shared/ephemeral-vm-runtime-store'
import { addEnvironmentFromPairingCode } from '../../shared/runtime-environment-store'
import { redactRuntimeEnvironment } from '../../shared/runtime-environments'
import {
  cleanupEphemeralVmRuntime,
  provisionEphemeralVmRuntime
} from '../ephemeral-vm-runtime-service'
import { connectRuntimeOwnedSshTarget } from '../ephemeral-vm-runtime-ssh'
import {
  getRecipeRepo,
  resolveRecipeForRepo,
  type EphemeralVmRecipeCatalogEntry
} from './ephemeral-vm-recipe-context'
import { registerEphemeralVmRuntimeHandlers } from './ephemeral-vm-runtime-handlers'
import type { PluginService } from '../plugins/plugin-service'
import { getApprovedPluginVmRecipes } from '../plugins/plugin-approved-vm-recipes'
import { resolveProvisionedRootSource } from '../ephemeral-vm-provisioned-root-source'
import {
  doctorEphemeralVm,
  listEphemeralVmRecipeCatalog,
  listEphemeralVmRecipes,
  type EphemeralVmProvisionIpcResult
} from '../ephemeral-vm-controller-service'

const activeProvisionControllers = new Map<string, AbortController>()

export function registerEphemeralVmHandlers(store: Store, pluginService?: PluginService): void {
  ipcMain.removeHandler('ephemeralVm:listRecipes')
  ipcMain.removeHandler('ephemeralVm:listRecipeCatalog')
  ipcMain.removeHandler('ephemeralVm:doctor')
  ipcMain.removeHandler('ephemeralVm:provision')
  ipcMain.removeHandler('ephemeralVm:cancelProvision')
  registerEphemeralVmRuntimeHandlers(store)

  ipcMain.handle('ephemeralVm:listRecipes', async (_event, args: { repoId: string }) => {
    return listEphemeralVmRecipes(store, pluginService, args)
  })

  ipcMain.handle(
    'ephemeralVm:listRecipeCatalog',
    async (): Promise<EphemeralVmRecipeCatalogEntry[]> => {
      return listEphemeralVmRecipeCatalog(store, pluginService)
    }
  )

  ipcMain.handle(
    'ephemeralVm:doctor',
    async (
      _event,
      args: { repoId: string; recipeId: string }
    ): Promise<EphemeralVmRecipeDoctorResult> => {
      return doctorEphemeralVm(store, pluginService, args)
    }
  )

  ipcMain.handle(
    'ephemeralVm:provision',
    async (
      _event,
      args: {
        repoId: string
        recipeId: string
        workspaceName?: string
        projectId?: string
        workspaceId?: string
        branch?: string
        ref?: string
        provisionId?: string
      }
    ): Promise<EphemeralVmProvisionIpcResult> => {
      const repo = getRecipeRepo(store, args.repoId)
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
      const sendProvisionEvent = (stream: 'stdout' | 'stderr', chunk: string): void => {
        if (!args.provisionId) {
          return
        }
        _event.sender.send('ephemeralVm:provisionEvent', {
          provisionId: args.provisionId,
          stream,
          chunk: redactEphemeralVmRecipeDiagnosticText(chunk)
        })
      }
      // Why: keep the controller registered across BOTH the recipe-create phase AND
      // the post-create SSH-connect/provider-wait phase, so cancelProvision can still
      // abort during the up-to-10s SSH connect window. Removing it in the provision
      // promise's own .finally() would deregister it before SSH connect even starts.
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
          userDataPath: app.getPath('userData'),
          repoPath: repo.repo.path,
          repoId: repo.repo.id,
          recipe,
          projectId: args.projectId,
          workspaceId: args.workspaceId,
          workspaceName: args.workspaceName,
          creatorProvenance: { kind: 'host' },
          ...(repoUrl ? { repoUrl } : {}),
          ...(args.branch ? { branch: args.branch } : {}),
          ...(sourceRef ? { ref: sourceRef } : {}),
          ...(expectedRefHead ? { expectedRefHead } : {}),
          ...(controller ? { signal: controller.signal } : {}),
          onStdout: (chunk) => sendProvisionEvent('stdout', chunk),
          onStderr: (chunk) => sendProvisionEvent('stderr', chunk)
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
            const runtime = updateEphemeralVmRuntimeStatus(
              app.getPath('userData'),
              result.runtime.id,
              {
                sshTargetId: ssh.targetId
              }
            )
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
              userDataPath: app.getPath('userData'),
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
          environment = addEnvironmentFromPairingCode(app.getPath('userData'), {
            name: buildEphemeralEnvironmentName(repo.repo.displayName, result.runtime.id),
            pairingCode: connection.pairingCode,
            source: 'ephemeral-vm'
          })
        } catch (error) {
          await cleanupEphemeralVmRuntime({
            userDataPath: app.getPath('userData'),
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
        const runtime = updateEphemeralVmRuntimeStatus(app.getPath('userData'), result.runtime.id, {
          runtimeEnvironmentId: environment.id
        })
        return {
          ok: true,
          connectionType: 'orca-server',
          runtime,
          environment: redactRuntimeEnvironment(environment),
          stderr: redactEphemeralVmRecipeDiagnosticText(result.start.stderr),
          warnings: getEphemeralVmRecipeResultWarnings(result.start.result)
        }
      } finally {
        if (args.provisionId) {
          activeProvisionControllers.delete(args.provisionId)
        }
      }
    }
  )

  ipcMain.handle(
    'ephemeralVm:cancelProvision',
    (_event, args: { provisionId: string }): { cancelled: boolean } => {
      const controller = activeProvisionControllers.get(args.provisionId)
      if (!controller) {
        return { cancelled: false }
      }
      controller.abort()
      activeProvisionControllers.delete(args.provisionId)
      return { cancelled: true }
    }
  )
}

function buildEphemeralEnvironmentName(repoName: string, runtimeId: string): string {
  return `${repoName} VM ${runtimeId.slice(-8)}`
}

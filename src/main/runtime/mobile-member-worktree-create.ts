import { getEphemeralVmRecipeResultProjectRoot } from '../../shared/ephemeral-vm-recipes'
import { parsePairingCode } from '../../shared/pairing'
import { sendRemoteRuntimeRequest } from '../../shared/remote-runtime-client'
import type { RuntimeRepoList } from '../../shared/runtime-types'
import type { WorkspaceCreatorProvenance } from '../../shared/worktree/types'
import type { EphemeralVmRpcReadService } from './rpc/methods/ephemeral-vm'

const MOBILE_CHILD_CREATE_TIMEOUT_MS = 30 * 60 * 1_000

type MobileWorktreeCreateParams = Record<string, unknown> & {
  repo: string
  name?: string
}

export async function createMobileMemberWorktree(args: {
  params: MobileWorktreeCreateParams
  actor: WorkspaceCreatorProvenance
  service: EphemeralVmRpcReadService
  callRemote?: typeof sendRemoteRuntimeRequest
}): Promise<unknown> {
  const repoId = parseRepoId(args.params.repo)
  const recipes = await args.service.listRecipes({ repoId })
  if (recipes.status !== 'ok' || recipes.recipes.length === 0) {
    throw new Error(
      recipes.message ?? 'This project has no per-workspace environment recipe for mobile.'
    )
  }
  // Older mobile builds cannot choose a recipe. Repository order is already the default ordering
  // presented by Orca, so use its first valid recipe as the compatibility default.
  const recipe = recipes.recipes[0]!
  const provisioned = await args.service.provision({
    repoId,
    recipeId: recipe.id,
    ...(args.params.name ? { workspaceName: args.params.name } : {}),
    creatorProvenance: args.actor
  })
  if (!provisioned.ok) {
    throw new Error(provisioned.error)
  }
  if (provisioned.connectionType !== 'orca-server') {
    await cleanupProvision(args.service, provisioned.runtime.id, args.actor)
    throw new Error('Mobile multiplayer workspaces require an Orca server environment recipe.')
  }

  try {
    const offer = parsePairingCode(provisioned.pairingCode)
    if (!offer) {
      throw new Error('The workspace runtime returned an invalid access credential.')
    }
    const callRemote = args.callRemote ?? sendRemoteRuntimeRequest
    const reposResponse = await callRemote<RuntimeRepoList>(
      offer,
      'repo.list',
      undefined,
      MOBILE_CHILD_CREATE_TIMEOUT_MS
    )
    if (!reposResponse.ok) {
      throw new Error(reposResponse.error.message)
    }
    const projectRoot = normalizePath(
      getEphemeralVmRecipeResultProjectRoot(provisioned.runtime.recipeResult)
    )
    const childRepo = reposResponse.result.repos.find(
      (repo) => normalizePath(repo.path) === projectRoot
    )
    if (!childRepo) {
      throw new Error(`The workspace runtime did not publish its project at ${projectRoot}.`)
    }
    const createResponse = await callRemote<unknown>(
      offer,
      'worktree.create',
      { ...args.params, repo: `id:${childRepo.id}` },
      MOBILE_CHILD_CREATE_TIMEOUT_MS
    )
    if (!createResponse.ok) {
      throw new Error(createResponse.error.message)
    }
    const worktreeId = readCreatedWorktreeId(createResponse.result)
    await args.service.attachWorkspace({
      runtimeId: provisioned.runtime.id,
      workspaceId: worktreeId,
      actor: args.actor
    })
    return createResponse.result
  } catch (error) {
    await cleanupProvision(args.service, provisioned.runtime.id, args.actor)
    throw error
  }
}

function parseRepoId(selector: string): string {
  if (!selector.startsWith('id:') || selector.length <= 3) {
    throw new Error('Mobile multiplayer workspace creation requires a project id.')
  }
  return selector.slice(3)
}

function readCreatedWorktreeId(result: unknown): string {
  if (typeof result !== 'object' || result === null) {
    throw new Error('The workspace runtime returned an invalid create result.')
  }
  const worktree = (result as { worktree?: unknown }).worktree
  if (typeof worktree !== 'object' || worktree === null) {
    throw new Error('The workspace runtime returned an invalid worktree.')
  }
  const id = (worktree as { id?: unknown }).id
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('The workspace runtime returned a worktree without an id.')
  }
  return id
}

function normalizePath(pathValue: string): string {
  return pathValue.length > 1 ? pathValue.replace(/\/+$/, '') : pathValue
}

async function cleanupProvision(
  service: EphemeralVmRpcReadService,
  runtimeId: string,
  actor: WorkspaceCreatorProvenance
): Promise<void> {
  await service.cleanup({ runtimeId, actor }).catch(() => undefined)
}

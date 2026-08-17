import type { GsdOrcaLaunchConsumeResult } from '../../../shared/gsd-orca-launch-contract'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { normalizeGitRemoteUrl } from '../../../shared/git-remote-identity'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'
import { createWebWorkspaceLink } from '@/lib/web-workspace-link'
import { WebRuntimeClient } from './web-runtime-client'
import {
  getPreferredWebPairingOffer,
  readStoredWebRuntimeEnvironment
} from './web-runtime-environment'

const PENDING_LAUNCH_KEY = 'orca.web.gsdLaunch.v1'
const GSD_IDENTITY_LINK_REQUIRED_MESSAGE =
  'Link this Orca member to GSD before opening card worktrees.'

export function resolveGsdControllerRepoId(args: {
  repos: readonly Repo[]
  controllerEnvironmentId: string
  repositoryRemoteUrl: string
}): string | null {
  const controllerHostId = toRuntimeExecutionHostId(args.controllerEnvironmentId)
  const targetKey = normalizeGitRemoteUrl(args.repositoryRemoteUrl)?.toLowerCase() ?? null
  if (!targetKey) {
    return null
  }
  const controllerRepos = args.repos.filter(
    (repo) => repo.executionHostId === controllerHostId && !repo.connectionId
  )
  const match = controllerRepos.find((repo) => {
    if (repo.gitRemoteIdentity?.canonicalKey.toLowerCase() === targetKey) {
      return true
    }
    if (!repo.upstream) {
      return false
    }
    const upstreamUrl = `https://${repo.upstream.host ?? 'github.com'}/${repo.upstream.owner}/${repo.upstream.repo}.git`
    return normalizeGitRemoteUrl(upstreamUrl)?.toLowerCase() === targetKey
  })
  return match?.id ?? null
}

export function isGsdIdentityLinkRequired(error: unknown): boolean {
  return error instanceof Error && error.message === GSD_IDENTITY_LINK_REQUIRED_MESSAGE
}

export function shouldConsumePendingGsdLaunch(args: {
  hasMultiplayerAccount: boolean
  hasPendingLaunch: boolean
  appHydrated: boolean
  alreadyStarted: boolean
}): boolean {
  return (
    args.hasMultiplayerAccount && args.hasPendingLaunch && args.appHydrated && !args.alreadyStarted
  )
}

export function shouldAutoCreateGsdWorkspace(args: {
  autoCreate: boolean
  alreadyStarted: boolean
  createDisabled: boolean
  initialAgent?: string
  selectedAgent: string | null
  initialRecipeId?: string
  selectedRecipeId: string | null
}): boolean {
  return (
    args.autoCreate &&
    !args.alreadyStarted &&
    !args.createDisabled &&
    (!args.initialAgent || args.selectedAgent === args.initialAgent) &&
    (!args.initialRecipeId || args.selectedRecipeId === args.initialRecipeId)
  )
}

export function captureGsdLaunchFromLocation(location: Location): boolean {
  const token = new URLSearchParams(location.hash.replace(/^#/, '')).get('launch')?.trim()
  if (!token) {
    return sessionStorage.getItem(PENDING_LAUNCH_KEY) !== null
  }
  sessionStorage.setItem(PENDING_LAUNCH_KEY, token)
  window.history.replaceState(null, '', `${location.pathname}${location.search}`)
  return true
}

export async function consumePendingGsdLaunch(): Promise<GsdOrcaLaunchConsumeResult | null> {
  const token = sessionStorage.getItem(PENDING_LAUNCH_KEY)
  if (!token) {
    return null
  }
  return await callController<GsdOrcaLaunchConsumeResult>('multiplayer.gsd.consumeLaunch', {
    token
  })
}

export async function linkPendingGsdLaunch(worktree: Worktree): Promise<void> {
  const token = sessionStorage.getItem(PENDING_LAUNCH_KEY)
  const runtimeEnvironmentId = worktree.runtimeOwnerEnvironmentId
  if (!token || !runtimeEnvironmentId) {
    return
  }
  await callController('multiplayer.gsd.linkLaunch', {
    token,
    runtimeEnvironmentId,
    worktreeId: worktree.id,
    url: createWebWorkspaceLink(window.location, runtimeEnvironmentId)
  })
  sessionStorage.removeItem(PENDING_LAUNCH_KEY)
}

export function pendingGsdLaunchToken(): string | null {
  return sessionStorage.getItem(PENDING_LAUNCH_KEY)
}

async function callController<TResult>(method: string, params: unknown): Promise<TResult> {
  const environment = readStoredWebRuntimeEnvironment()
  if (!environment) {
    throw new Error('Sign in to Orca before opening this GSD card.')
  }
  const client = new WebRuntimeClient(getPreferredWebPairingOffer(environment))
  try {
    const response = await client.call(method, params, { timeoutMs: 15_000 })
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    return response.result as TResult
  } finally {
    client.close()
  }
}

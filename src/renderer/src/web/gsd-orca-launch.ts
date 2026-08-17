import type { GsdOrcaLaunchConsumeResult } from '../../../shared/gsd-orca-launch-contract'
import type { Worktree } from '../../../shared/worktree/types'
import { createWebWorkspaceLink } from '@/lib/web-workspace-link'
import { WebRuntimeClient } from './web-runtime-client'
import {
  getPreferredWebPairingOffer,
  readStoredWebRuntimeEnvironment
} from './web-runtime-environment'

const PENDING_LAUNCH_KEY = 'orca.web.gsdLaunch.v1'

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

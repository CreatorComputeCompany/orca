import type { Worktree } from '../../../shared/worktree/types'

const WORKSPACE_QUERY_PARAM = 'workspace'
const WORKSPACE_REFERENCE_PATTERN = /^[a-zA-Z0-9-]{1,128}$/

export function readWebWorkspaceReference(location: Pick<Location, 'search'>): string | null {
  const value = new URLSearchParams(location.search).get(WORKSPACE_QUERY_PARAM)?.trim()
  return value && WORKSPACE_REFERENCE_PATTERN.test(value) ? value : null
}

export function createWebWorkspaceLink(
  location: Pick<Location, 'origin' | 'pathname'>,
  runtimeEnvironmentId: string
): string {
  if (!WORKSPACE_REFERENCE_PATTERN.test(runtimeEnvironmentId)) {
    throw new Error('Invalid workspace reference')
  }
  const url = new URL(location.pathname, location.origin)
  url.searchParams.set(WORKSPACE_QUERY_PARAM, runtimeEnvironmentId)
  return url.toString()
}

export function findWorktreeForWebWorkspaceReference(
  worktrees: readonly Worktree[],
  runtimeEnvironmentId: string
): Worktree | null {
  return (
    worktrees.find((worktree) => worktree.runtimeOwnerEnvironmentId === runtimeEnvironmentId) ??
    null
  )
}

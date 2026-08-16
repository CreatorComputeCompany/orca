import type { Worktree } from '../../../shared/worktree/types'
import { toHostSessionTabId, toWebTerminalSurfaceTabId } from '../../../shared/terminal-surface-id'

const WORKSPACE_QUERY_PARAM = 'workspace'
const SESSION_QUERY_PARAM = 'session'
const WORKSPACE_REFERENCE_PATTERN = /^[a-zA-Z0-9-]{1,128}$/
const SESSION_REFERENCE_PATTERN = /^[a-zA-Z0-9._~-]{1,256}$/

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

export function readWebSessionReference(location: Pick<Location, 'search'>): string | null {
  const value = new URLSearchParams(location.search).get(SESSION_QUERY_PARAM)?.trim()
  return value && SESSION_REFERENCE_PATTERN.test(value) ? value : null
}

export function createWebSessionLink(
  location: Pick<Location, 'origin' | 'pathname'>,
  runtimeEnvironmentId: string,
  terminalTabId: string
): string {
  const sessionId = toHostSessionTabId(terminalTabId)
  if (!SESSION_REFERENCE_PATTERN.test(sessionId)) {
    throw new Error('Invalid session reference')
  }
  const url = new URL(createWebWorkspaceLink(location, runtimeEnvironmentId))
  url.searchParams.set(SESSION_QUERY_PARAM, sessionId)
  return url.toString()
}

export function toWebSessionTerminalTabId(sessionReference: string): string {
  if (!SESSION_REFERENCE_PATTERN.test(sessionReference)) {
    throw new Error('Invalid session reference')
  }
  return toWebTerminalSurfaceTabId(sessionReference)
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

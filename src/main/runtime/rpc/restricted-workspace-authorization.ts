import type { OrcaRuntimeService } from '../orca-runtime'

const SAFE_CATALOG_METHODS = new Set([
  'worktree.list',
  'worktree.ps',
  'worktree.detectedList',
  'worktree.listRetiredNames',
  'worktree.lineageList'
])

export async function authorizeRestrictedWorkspaceRequest(
  runtime: OrcaRuntimeService,
  method: string,
  params: unknown,
  workspaceOwnerMemberKey: string | undefined
): Promise<void> {
  if (!workspaceOwnerMemberKey || SAFE_CATALOG_METHODS.has(method)) {
    return
  }
  const isWorkspaceMethod = method.startsWith('worktree.') || method.startsWith('terminal.')
  const value = params && typeof params === 'object' ? (params as Record<string, unknown>) : {}
  const selectors = [value.worktree, value.worktreeId].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0
  )
  for (const selector of selectors) {
    const worktree = await runtime.showManagedWorktree(selector)
    assertOwner(worktree.ownerMemberKey, workspaceOwnerMemberKey)
  }
  const handles = [value.terminal, value.sourceTerminal, value.targetTerminal].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0
  )
  for (const handle of handles) {
    const terminal = await runtime.showTerminal(handle)
    const worktree = await runtime.showManagedWorktree(terminal.worktreeId)
    assertOwner(worktree.ownerMemberKey, workspaceOwnerMemberKey)
  }
  if (isWorkspaceMethod && selectors.length === 0 && handles.length === 0) {
    throw new Error('workspace_access_denied')
  }
}

function assertOwner(actual: string | undefined, expected: string): void {
  if (actual !== expected) {
    throw new Error('workspace_access_denied')
  }
}

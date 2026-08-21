import { defineMethod, type RpcMethod } from '../core'
import { resolveWorktreeCatalogSnapshot } from '../worktree-catalog-snapshot'
import { supportsWorktreeVisibilitySourceDefaults } from '../worktree-visibility-client-capability'
import {
  WorktreeDetectedListParams,
  WorktreeListParams,
  WorktreePsParams
} from './worktree-schemas'

export const WORKTREE_CATALOG_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'worktree.ps',
    params: WorktreePsParams,
    handler: async (params, context) => {
      const result = await context.runtime.getWorktreePs(
        params.limit,
        supportsWorktreeVisibilitySourceDefaults(
          context,
          params.supportsWorktreeVisibilitySourceDefaults
        )
      )
      // Why: callers that never send the field get the byte-exact legacy response.
      const restricted = context.workspaceOwnerMemberKey
        ? {
            ...result,
            worktrees: result.worktrees.filter(
              (worktree) => worktree.ownerMemberKey === context.workspaceOwnerMemberKey
            ),
            totalCount: result.worktrees.some(
              (worktree) => worktree.ownerMemberKey === context.workspaceOwnerMemberKey
            )
              ? result.worktrees.filter(
                  (worktree) => worktree.ownerMemberKey === context.workspaceOwnerMemberKey
                ).length
              : 0,
            truncated: false
          }
        : result
      return params.afterSnapshotId === undefined
        ? restricted
        : resolveWorktreeCatalogSnapshot(restricted, params.afterSnapshotId)
    }
  }),
  defineMethod({
    name: 'worktree.list',
    params: WorktreeListParams,
    handler: async (params, context) => {
      const result = await context.runtime.listManagedWorktrees(
        params.repo,
        params.limit,
        supportsWorktreeVisibilitySourceDefaults(context)
      )
      if (!context.workspaceOwnerMemberKey) {
        return result
      }
      const worktrees = result.worktrees.filter(
        (worktree) => worktree.ownerMemberKey === context.workspaceOwnerMemberKey
      )
      return { worktrees, totalCount: worktrees.length, truncated: false }
    }
  }),
  defineMethod({
    name: 'worktree.listRetiredNames',
    params: WorktreeDetectedListParams,
    handler: async (params, context) =>
      context.workspaceOwnerMemberKey
        ? { retiredNamesByRepo: {}, retiredNameTiersByRepo: {} }
        : context.runtime.listRetiredWorktreeNames(params.repo)
  }),
  defineMethod({
    name: 'worktree.detectedList',
    params: WorktreeDetectedListParams,
    handler: async (params, context) => {
      const result = await context.runtime.listDetectedManagedWorktrees(
        params.repo,
        undefined,
        supportsWorktreeVisibilitySourceDefaults(context)
      )
      return context.workspaceOwnerMemberKey
        ? {
            ...result,
            worktrees: result.worktrees.filter(
              (worktree) => worktree.ownerMemberKey === context.workspaceOwnerMemberKey
            )
          }
        : result
    }
  })
]

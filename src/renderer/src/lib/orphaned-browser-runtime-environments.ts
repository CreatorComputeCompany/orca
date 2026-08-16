import type { Worktree } from '../../../shared/worktree/types'
import type { RuntimeApi } from '../../../preload/api/runtime-api'

export function collectOrphanedBrowserRuntimeEnvironmentIds(args: {
  runtimeEnvironmentIds: Iterable<string>
  worktreesByRepo: Record<string, readonly Worktree[]>
}): string[] {
  const current = new Set(args.runtimeEnvironmentIds)
  const orphaned = new Set<string>()
  for (const worktrees of Object.values(args.worktreesByRepo)) {
    for (const worktree of worktrees) {
      const environmentId = worktree.runtimeOwnerEnvironmentId?.trim()
      if (environmentId && !current.has(environmentId)) {
        orphaned.add(environmentId)
      }
    }
  }
  return [...orphaned]
}

export async function purgeOrphanedBrowserRuntimeEnvironments(args: {
  runtimeEnvironmentsApi: RuntimeApi['runtimeEnvironments']
  state: {
    runtimeEnvironments: readonly { id: string }[]
    worktreesByRepo: Record<string, readonly Worktree[]>
  }
  retire: (environmentIds: Iterable<string>) => void
}): Promise<void> {
  const consume = args.runtimeEnvironmentsApi.consumeRetiredEnvironmentIds
  if (!consume) {
    return
  }
  const explicit = await consume()
  args.retire([
    ...explicit,
    ...collectOrphanedBrowserRuntimeEnvironmentIds({
      runtimeEnvironmentIds: args.state.runtimeEnvironments.map((environment) => environment.id),
      worktreesByRepo: args.state.worktreesByRepo
    })
  ])
}

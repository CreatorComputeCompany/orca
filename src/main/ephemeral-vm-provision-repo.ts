import { getProjectIdentityKey } from '../shared/project-host-setup-projection'
import type { Store } from './persistence'
import { getRecipeRepo, type RecipeRepoResult } from './ipc/ephemeral-vm-recipe-context'

export function resolveEphemeralVmProvisionRepo(
  store: Store,
  args: { repoId: string; projectId?: string }
): RecipeRepoResult {
  const exact = getRecipeRepo(store, args.repoId)
  if (exact.ok || !args.projectId) {
    return exact
  }

  const project = store.getProjects().find((entry) => entry.id === args.projectId)
  const projectRepoIds = new Set(project?.sourceRepoIds ?? [])
  const candidates = store
    .getRepos()
    .filter((repo) => projectRepoIds.has(repo.id) || getProjectIdentityKey(repo) === args.projectId)
  const resolved = candidates
    .map((repo) => getRecipeRepo(store, repo.id))
    .filter((entry): entry is Extract<RecipeRepoResult, { ok: true }> => entry.ok)

  return resolved.length === 1 ? resolved[0] : exact
}

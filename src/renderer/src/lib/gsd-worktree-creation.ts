import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import { materializeGsdLaunchAttachments } from '@/web/gsd-orca-launch'

export async function prepareGsdLaunchWorktree(
  request: WorktreeCreationRequest,
  worktreeId: string
): Promise<string | null> {
  if (!request.gsdLaunch?.attachments.length) {
    return null
  }
  const environmentId = request.ephemeralVmRuntimeEnvironmentId
  if (!environmentId) {
    return 'Could not copy GSD attachments because the workspace VM is unavailable.'
  }
  try {
    await materializeGsdLaunchAttachments({
      environmentId,
      worktreeId,
      attachments: request.gsdLaunch.attachments
    })
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

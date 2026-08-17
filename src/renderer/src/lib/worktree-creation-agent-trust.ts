import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import { TUI_AGENT_CONFIG } from '../../../shared/tui-agent-config'

export async function preflightWorktreeAgentTrust(
  request: WorktreeCreationRequest,
  path: string,
  connectionId?: string | null
): Promise<void> {
  // Why: trust-gated agents consume the first bracketed paste as menu input.
  // Best-effort pre-write their trust artifact before any terminal spawns.
  if (!request.agent || !window.api.agentTrust?.markTrusted) {
    return
  }
  const preflight = TUI_AGENT_CONFIG[request.agent].preflightTrust
  if (!preflight) {
    return
  }
  try {
    await window.api.agentTrust.markTrusted({
      preset: preflight,
      workspacePath: path,
      ...(connectionId ? { connectionId } : {})
    })
  } catch {
    // The worktree exists already; a trust preflight failure must not strand it.
  }
}

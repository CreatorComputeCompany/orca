import type { MultiplayerAuthResult } from '../../../shared/multiplayer-auth-contract'
import { useAppStore } from '@/store'
import { readStoredWebRuntimeEnvironment } from './web-runtime-environment'

export type OrcaWebEmbedController = {
  focusWorktree: (worktreeId: string) => void
}

export type OrcaWebEmbedBootstrap = {
  container: HTMLElement
  pairingCode?: string
  // Why: the host's backend signs the visitor in as an Orca member and hands
  // the result over, so the embedded client never shows its own account
  // screens. Shaped exactly like the SSO return the standalone web client
  // already consumes.
  authResult?: MultiplayerAuthResult
  controller?: OrcaWebEmbedController
}

// Why: a host page (e.g. Buzz) mounts the unchanged web client inside its own
// DOM by defining `window.__ORCA_WEB_EMBED__` before importing this entry.
// Only the bootstrap differs from the standalone web client: the mount element
// and the pairing input come from the host instead of the document and URL.
export function readOrcaWebEmbedBootstrap(target: Window): OrcaWebEmbedBootstrap | null {
  const value = (target as Window & { __ORCA_WEB_EMBED__?: unknown }).__ORCA_WEB_EMBED__
  if (value === null || typeof value !== 'object') {
    return null
  }
  const bootstrap = value as Partial<OrcaWebEmbedBootstrap>
  if (!(bootstrap.container instanceof HTMLElement)) {
    return null
  }
  if (bootstrap.pairingCode !== undefined && typeof bootstrap.pairingCode !== 'string') {
    return null
  }
  if (bootstrap.authResult !== undefined && !isMultiplayerAuthResult(bootstrap.authResult)) {
    return null
  }
  return bootstrap as OrcaWebEmbedBootstrap
}

function isMultiplayerAuthResult(value: unknown): value is MultiplayerAuthResult {
  const result = value as Partial<MultiplayerAuthResult> | null
  return (
    typeof result?.pairingUrl === 'string' &&
    typeof result.email === 'string' &&
    typeof result.member?.key === 'string' &&
    typeof result.member.displayName === 'string'
  )
}

// Why: a host page passes its pairing code on every boot (it has no address
// bar to clear). Re-saving the same runtime offer would discard the personal
// device and member identity enrolled on earlier visits.
export function storedEnvironmentCoversPairingOffer(offer: { endpoint: string }): boolean {
  const environment = readStoredWebRuntimeEnvironment()
  return environment?.endpoints.some((endpoint) => endpoint.endpoint === offer.endpoint) ?? false
}

export function installOrcaWebEmbedController(bootstrap: OrcaWebEmbedBootstrap): void {
  bootstrap.controller = {
    focusWorktree: (worktreeId: string) => {
      whenAppHydrated(() => {
        const state = useAppStore.getState()
        state.setActiveView('terminal')
        state.setActiveWorktree(worktreeId)
        // Why: an embedding host shows one session inside its own product
        // chrome. The workspace sidebar and explorer stay a click away, but
        // the focused view is the worktree's terminal surface alone.
        state.setSidebarOpen(false)
        state.setRightSidebarOpen(false)
      })
    }
  }
}

function whenAppHydrated(run: () => void): void {
  if (useAppStore.getState().hydrationSucceeded) {
    run()
    return
  }
  const unsubscribe = useAppStore.subscribe((state) => {
    if (state.hydrationSucceeded) {
      unsubscribe()
      run()
    }
  })
}

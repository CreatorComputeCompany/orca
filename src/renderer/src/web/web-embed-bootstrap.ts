import { useAppStore } from '@/store'
import { readStoredWebRuntimeEnvironment } from './web-runtime-environment'

export type OrcaWebEmbedController = {
  focusWorktree: (worktreeId: string) => void
}

export type OrcaWebEmbedBootstrap = {
  container: HTMLElement
  pairingCode?: string
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
  return bootstrap as OrcaWebEmbedBootstrap
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

// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installOrcaWebEmbedController,
  readOrcaWebEmbedBootstrap,
  storedEnvironmentCoversPairingOffer,
  type OrcaWebEmbedBootstrap
} from './web-embed-bootstrap'
import { useAppStore } from '@/store'

vi.mock('@/store', () => {
  const state = {
    hydrationSucceeded: false,
    setActiveView: vi.fn(),
    setActiveWorktree: vi.fn()
  }
  const listeners = new Set<(next: typeof state) => void>()
  return {
    useAppStore: {
      getState: () => state,
      subscribe: (listener: (next: typeof state) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      __notify: () => listeners.forEach((listener) => listener(state))
    }
  }
})

type MockedStore = typeof useAppStore & { __notify: () => void }
const store = useAppStore as MockedStore

function embedWindow(value: unknown): Window {
  return { __ORCA_WEB_EMBED__: value } as unknown as Window
}

describe('readOrcaWebEmbedBootstrap', () => {
  it('returns null when the global is absent', () => {
    expect(readOrcaWebEmbedBootstrap({} as Window)).toBeNull()
  })

  it('rejects a bootstrap without a container element', () => {
    expect(readOrcaWebEmbedBootstrap(embedWindow({ pairingCode: 'abc' }))).toBeNull()
    expect(readOrcaWebEmbedBootstrap(embedWindow({ container: 'not-an-element' }))).toBeNull()
  })

  it('rejects a non-string pairing code', () => {
    const container = document.createElement('div')
    expect(readOrcaWebEmbedBootstrap(embedWindow({ container, pairingCode: 42 }))).toBeNull()
  })

  it('accepts a container with an optional pairing code', () => {
    const container = document.createElement('div')
    const bootstrap = readOrcaWebEmbedBootstrap(embedWindow({ container, pairingCode: 'abc' }))
    expect(bootstrap).toEqual({ container, pairingCode: 'abc' })
    expect(readOrcaWebEmbedBootstrap(embedWindow({ container }))).toEqual({ container })
  })
})

describe('storedEnvironmentCoversPairingOffer', () => {
  beforeEach(() => window.localStorage.clear())

  it('is false without a stored environment', () => {
    expect(storedEnvironmentCoversPairingOffer({ endpoint: 'ws://127.0.0.1:6768' })).toBe(false)
  })

  it('matches only a stored environment holding the same endpoint', () => {
    window.localStorage.setItem(
      'orca.web.runtimeEnvironment.v1',
      JSON.stringify({
        id: 'env-1',
        name: 'Orca Server',
        endpoints: [
          {
            id: 'endpoint-1',
            kind: 'websocket',
            label: 'Primary',
            endpoint: 'ws://127.0.0.1:6768',
            deviceToken: 'token',
            publicKeyB64: 'key'
          }
        ]
      })
    )
    expect(storedEnvironmentCoversPairingOffer({ endpoint: 'ws://127.0.0.1:6768' })).toBe(true)
    expect(storedEnvironmentCoversPairingOffer({ endpoint: 'ws://127.0.0.1:9999' })).toBe(false)
  })
})

describe('installOrcaWebEmbedController', () => {
  beforeEach(() => {
    const state = useAppStore.getState()
    state.hydrationSucceeded = false
    vi.mocked(state.setActiveView).mockClear()
    vi.mocked(state.setActiveWorktree).mockClear()
  })

  it('focuses the worktree immediately when the app is hydrated', () => {
    useAppStore.getState().hydrationSucceeded = true
    const bootstrap: OrcaWebEmbedBootstrap = { container: document.createElement('div') }
    installOrcaWebEmbedController(bootstrap)
    bootstrap.controller?.focusWorktree('worktree-1')
    expect(useAppStore.getState().setActiveView).toHaveBeenCalledWith('terminal')
    expect(useAppStore.getState().setActiveWorktree).toHaveBeenCalledWith('worktree-1')
  })

  it('defers the focus until hydration succeeds', () => {
    const bootstrap: OrcaWebEmbedBootstrap = { container: document.createElement('div') }
    installOrcaWebEmbedController(bootstrap)
    bootstrap.controller?.focusWorktree('worktree-2')
    expect(useAppStore.getState().setActiveWorktree).not.toHaveBeenCalled()
    useAppStore.getState().hydrationSucceeded = true
    store.__notify()
    expect(useAppStore.getState().setActiveView).toHaveBeenCalledWith('terminal')
    expect(useAppStore.getState().setActiveWorktree).toHaveBeenCalledWith('worktree-2')
    vi.mocked(useAppStore.getState().setActiveWorktree).mockClear()
    store.__notify()
    expect(useAppStore.getState().setActiveWorktree).not.toHaveBeenCalled()
  })
})

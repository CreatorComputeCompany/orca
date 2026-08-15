import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import { createBrowserSlice } from './browser'

const { callRuntimeRpcMock, sessionClearDefaultCookiesMock } = vi.hoisted(() => ({
  callRuntimeRpcMock: vi.fn(),
  sessionClearDefaultCookiesMock: vi.fn()
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: callRuntimeRpcMock }))
vi.mock('@/runtime/web-runtime-session', () => ({ createWebRuntimeSessionBrowserTab: vi.fn() }))

globalThis.window = {
  api: { browser: { sessionClearDefaultCookies: sessionClearDefaultCookiesMock } as never }
} as never

function createTestStore() {
  return create<AppState>()(
    (...args) =>
      ({
        settings: { activeRuntimeEnvironmentId: null } as AppState['settings'],
        ...createBrowserSlice(...args)
      }) as unknown as AppState
  )
}

describe('clearDefaultSessionCookies execution host', () => {
  beforeEach(() => {
    callRuntimeRpcMock.mockReset().mockResolvedValue({ cleared: true })
    sessionClearDefaultCookiesMock.mockReset().mockResolvedValue(true)
  })

  it('targets the captured runtime host after browser settings move elsewhere', async () => {
    const store = createTestStore()
    store.setState({ browserSessionHostIdOverride: 'runtime:selected-host' })

    await expect(store.getState().clearDefaultSessionCookies('runtime:import-host')).resolves.toBe(
      true
    )

    expect(callRuntimeRpcMock).toHaveBeenCalledOnce()
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'import-host' },
      'browser.profileClearDefaultCookies',
      undefined,
      { timeoutMs: 15_000 }
    )
    expect(sessionClearDefaultCookiesMock).not.toHaveBeenCalled()
  })

  it('targets local IPC when the captured import host was local', async () => {
    const store = createTestStore()
    store.setState({ browserSessionHostIdOverride: 'runtime:selected-host' })

    await expect(store.getState().clearDefaultSessionCookies('local')).resolves.toBe(true)

    expect(sessionClearDefaultCookiesMock).toHaveBeenCalledOnce()
    expect(callRuntimeRpcMock).not.toHaveBeenCalled()
  })
})

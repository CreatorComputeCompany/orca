import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import { createBrowserSlice } from './browser'

const {
  callRuntimeRpcMock,
  sessionClearDefaultCookiesMock,
  sessionClearGoogleCookiesMock,
  sessionHasGoogleCookiesMock
} = vi.hoisted(() => ({
  callRuntimeRpcMock: vi.fn(),
  sessionClearDefaultCookiesMock: vi.fn(),
  sessionClearGoogleCookiesMock: vi.fn(),
  sessionHasGoogleCookiesMock: vi.fn()
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: callRuntimeRpcMock }))
vi.mock('@/runtime/web-runtime-session', () => ({ createWebRuntimeSessionBrowserTab: vi.fn() }))

globalThis.window = {
  api: {
    browser: {
      sessionClearDefaultCookies: sessionClearDefaultCookiesMock,
      sessionClearGoogleCookies: sessionClearGoogleCookiesMock,
      sessionHasGoogleCookies: sessionHasGoogleCookiesMock
    } as never
  }
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
    callRuntimeRpcMock
      .mockReset()
      .mockImplementation(async (_target, method) =>
        method === 'browser.profileHasGoogleCookies' ? { present: true } : { cleared: true }
      )
    sessionClearDefaultCookiesMock.mockReset().mockResolvedValue(true)
    sessionClearGoogleCookiesMock.mockReset().mockResolvedValue(true)
    sessionHasGoogleCookiesMock.mockReset().mockResolvedValue(true)
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

  it('routes Google presence and clearing to the captured runtime host and profile', async () => {
    const store = createTestStore()
    store.setState({ browserSessionHostIdOverride: 'runtime:selected-host' })

    await expect(
      store.getState().hasBrowserProfileGoogleCookies('profile-a', 'runtime:import-host')
    ).resolves.toBe(true)
    await expect(
      store.getState().clearBrowserProfileGoogleCookies('profile-a', 'runtime:import-host')
    ).resolves.toBe(true)

    expect(callRuntimeRpcMock.mock.calls).toEqual([
      [
        { kind: 'environment', environmentId: 'import-host' },
        'browser.profileHasGoogleCookies',
        { profileId: 'profile-a' },
        { timeoutMs: 15_000 }
      ],
      [
        { kind: 'environment', environmentId: 'import-host' },
        'browser.profileClearGoogleCookies',
        { profileId: 'profile-a' },
        { timeoutMs: 15_000 }
      ]
    ])
    expect(sessionHasGoogleCookiesMock).not.toHaveBeenCalled()
    expect(sessionClearGoogleCookiesMock).not.toHaveBeenCalled()
  })

  it('routes Google presence and clearing through local IPC for a local import', async () => {
    const store = createTestStore()
    store.setState({ browserSessionHostIdOverride: 'runtime:selected-host' })

    await expect(
      store.getState().hasBrowserProfileGoogleCookies('profile-a', 'local')
    ).resolves.toBe(true)
    await expect(
      store.getState().clearBrowserProfileGoogleCookies('profile-a', 'local')
    ).resolves.toBe(true)

    expect(sessionHasGoogleCookiesMock).toHaveBeenCalledWith({ profileId: 'profile-a' })
    expect(sessionClearGoogleCookiesMock).toHaveBeenCalledWith({ profileId: 'profile-a' })
    expect(callRuntimeRpcMock).not.toHaveBeenCalled()
  })
})

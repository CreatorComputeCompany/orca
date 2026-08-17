import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import {
  encodePairingCode,
  installBrowserGlobals,
  writeStoredRuntimeEnvironment
} from './web-preload-api-test-harness'

describe('web live runtime catalog', () => {
  beforeEach(() => vi.resetModules())

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  it('updates changed environments in place and retains them across stream errors', async () => {
    let onResponse: ((response: RuntimeRpcResponse<unknown>) => void) | undefined
    let onError: ((error: Error) => void) | undefined
    const close = vi.fn()
    vi.doMock('./web-runtime-client', () => ({
      WebRuntimeClient: class {
        subscribe(
          _method: string,
          _params: unknown,
          callbacks: {
            onResponse: (response: RuntimeRpcResponse<unknown>) => void
            onError?: (error: Error) => void
          }
        ): Promise<{ unsubscribe: () => void }> {
          onResponse = callbacks.onResponse
          onError = callbacks.onError
          return Promise.resolve({ unsubscribe: vi.fn() })
        }

        close(): void {
          close()
        }
      }
    }))
    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage, 'controller')
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()
    const published: unknown[][] = []
    const unsubscribe = globals.window.api.ephemeralVm.onRuntimesChanged?.((environments) =>
      published.push(environments)
    )
    await vi.waitFor(() => expect(onResponse).toBeTypeOf('function'))
    const pairingCode = encodePairingCode({ endpoint: 'wss://child.example' })

    onResponse?.({
      id: 'stream',
      ok: true,
      result: {
        type: 'snapshot',
        runtimes: [
          {
            id: 'runtime-1',
            runtimeEnvironmentId: 'child-1',
            workspaceName: 'Shared',
            liveMembers: [{ key: 'jake', displayName: 'Jake', worktreeId: 'worktree-1' }],
            recipeResult: { schemaVersion: 1, pairingCode, projectRoot: '/workspace' }
          }
        ]
      },
      streaming: true,
      _meta: { runtimeId: 'controller-runtime' }
    })

    expect(published.at(-1)).toMatchObject([
      { id: 'controller' },
      {
        id: 'child-1',
        workspaceLiveMembers: [{ key: 'jake', displayName: 'Jake', worktreeId: 'worktree-1' }]
      }
    ])
    const storedBeforeError = globals.storage.getItem('orca.web.runtimeEnvironments.additional.v1')

    onError?.(new Error('reconnecting'))

    expect(published).toHaveLength(1)
    expect(globals.storage.getItem('orca.web.runtimeEnvironments.additional.v1')).toBe(
      storedBeforeError
    )
    expect(close).not.toHaveBeenCalled()
    unsubscribe?.()
  })
})

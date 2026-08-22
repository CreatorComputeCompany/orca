import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import {
  installBrowserGlobals,
  writeStoredRuntimeEnvironment
} from './web-preload-api-test-harness'

describe('web runtime access pruning', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  it('closes and forgets workspace VMs no longer authorized by the controller', async () => {
    const closed: string[] = []
    vi.doMock('./web-runtime-client', () => ({
      WebRuntimeClient: class {
        constructor(private readonly offer: { endpoint: string }) {}

        call(method: string): Promise<RuntimeRpcResponse<unknown>> {
          return Promise.resolve({
            id: method,
            ok: true,
            result: method === 'ephemeralVm.listRuntimes' ? [] : {},
            _meta: { runtimeId: 'runtime' }
          })
        }

        close(): void {
          closed.push(this.offer.endpoint)
        }
      }
    }))
    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage, 'controller')
    globals.storage.setItem(
      'orca.web.runtimeEnvironments.additional.v1',
      JSON.stringify([
        {
          id: 'revoked-child',
          name: 'Steven VM',
          createdAt: 2,
          updatedAt: 2,
          lastUsedAt: null,
          runtimeId: null,
          source: 'ephemeral-vm',
          preferredEndpointId: 'ws-revoked-child',
          endpoints: [
            {
              id: 'ws-revoked-child',
              kind: 'websocket',
              label: 'WebSocket',
              endpoint: 'wss://revoked-child.example',
              deviceToken: 'revoked-token',
              publicKeyB64: 'revoked-key'
            }
          ]
        }
      ])
    )
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await globals.window.api.runtimeEnvironments.getStatus({ selector: 'revoked-child' })
    await expect(globals.window.api.runtimeEnvironments.list()).resolves.toMatchObject([
      { id: 'controller' }
    ])
    await expect(
      globals.window.api.runtimeEnvironments.consumeRetiredEnvironmentIds?.()
    ).resolves.toEqual(['revoked-child'])
    await expect(
      globals.window.api.runtimeEnvironments.consumeRetiredEnvironmentIds?.()
    ).resolves.toEqual([])

    expect(closed).toContain('wss://revoked-child.example')
    expect(
      JSON.parse(globals.storage.getItem('orca.web.runtimeEnvironments.additional.v1') ?? '[]')
    ).toEqual([])
  })

  it('retains the last credential when authorized viewer projection is transiently unavailable', async () => {
    vi.doMock('./web-runtime-client', () => ({
      WebRuntimeClient: class {
        call(method: string): Promise<RuntimeRpcResponse<unknown>> {
          return Promise.resolve({
            id: method,
            ok: true,
            result:
              method === 'ephemeralVm.listRuntimes'
                ? [
                    {
                      id: 'runtime-record',
                      runtimeEnvironmentId: 'retained-child',
                      viewerAccessUnavailable: true,
                      recipeResult: {
                        schemaVersion: 1,
                        pairingCode: 'orca://pair?unavailable=transient',
                        projectRoot: '/workspace'
                      }
                    }
                  ]
                : {},
            _meta: { runtimeId: 'runtime' }
          })
        }

        close(): void {}
      }
    }))
    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage, 'controller')
    const retained = {
      id: 'retained-child',
      name: 'Jake VM',
      createdAt: 2,
      updatedAt: 2,
      lastUsedAt: null,
      runtimeId: 'child-runtime',
      source: 'ephemeral-vm',
      preferredEndpointId: 'ws-retained-child',
      endpoints: [
        {
          id: 'ws-retained-child',
          kind: 'websocket',
          label: 'WebSocket',
          endpoint: 'wss://retained-child.example',
          deviceToken: 'retained-token',
          publicKeyB64: 'retained-key'
        }
      ]
    }
    globals.storage.setItem(
      'orca.web.runtimeEnvironments.additional.v1',
      JSON.stringify([retained])
    )
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await expect(globals.window.api.runtimeEnvironments.list()).resolves.toMatchObject([
      { id: 'controller' },
      { id: 'retained-child', runtimeId: 'child-runtime' }
    ])
    expect(
      JSON.parse(globals.storage.getItem('orca.web.runtimeEnvironments.additional.v1') ?? '[]')
    ).toEqual([retained])
  })
})

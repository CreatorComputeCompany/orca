import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import {
  encodePairingCode,
  installBrowserGlobals,
  writeStoredRuntimeEnvironment
} from './web-preload-api-test-harness'

describe('web runtime credential rotation', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  it('replaces a cached child client when discovery rotates its member credential', async () => {
    let childPairingCode = encodePairingCode({
      endpoint: 'wss://shared-child.example',
      deviceToken: 'old-child-token',
      publicKeyB64: 'shared-child-key'
    })
    const connectedTokens: string[] = []
    const closedTokens: string[] = []
    vi.doMock('./web-runtime-client', () => ({
      WebRuntimeClient: class {
        constructor(private readonly offer: { deviceToken: string }) {
          connectedTokens.push(offer.deviceToken)
        }

        call(method: string): Promise<RuntimeRpcResponse<unknown>> {
          return Promise.resolve({
            id: method,
            ok: true,
            result:
              method === 'ephemeralVm.listRuntimes'
                ? [
                    {
                      id: 'vm-runtime-1',
                      runtimeEnvironmentId: 'shared-child-environment',
                      recipeResult: {
                        pairingCode: childPairingCode,
                        projectRoot: '/workspace/emma'
                      }
                    }
                  ]
                : {},
            _meta: { runtimeId: 'runtime' }
          })
        }

        close(): void {
          closedTokens.push(this.offer.deviceToken)
        }
      }
    }))
    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage, 'controller')
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    const firstEnvironment = (await globals.window.api.runtimeEnvironments.list())[1]!
    await globals.window.api.runtimeEnvironments.getStatus({
      selector: 'shared-child-environment'
    })
    childPairingCode = encodePairingCode({
      endpoint: 'wss://shared-child.example',
      deviceToken: 'new-child-token',
      publicKeyB64: 'shared-child-key'
    })
    const secondEnvironment = (await globals.window.api.runtimeEnvironments.list())[1]!
    await globals.window.api.runtimeEnvironments.getStatus({
      selector: 'shared-child-environment'
    })

    expect(secondEnvironment.pairingRevision).toBeGreaterThan(
      firstEnvironment.pairingRevision ?? firstEnvironment.createdAt
    )
    expect(connectedTokens).toContain('old-child-token')
    expect(connectedTokens).toContain('new-child-token')
    expect(closedTokens).toContain('old-child-token')
  })
})

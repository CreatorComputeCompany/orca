import { describe, expect, it } from 'vitest'
import { redactStoredWebRuntimeEnvironment } from './web-runtime-environment'

describe('web multiplayer runtime redaction', () => {
  it('publishes the signed-in controller member as a catalog viewer', () => {
    expect(
      redactStoredWebRuntimeEnvironment({
        id: 'controller',
        name: 'Controller',
        createdAt: 1,
        updatedAt: 1,
        lastUsedAt: null,
        runtimeId: null,
        multiplayerMemberKey: 'jake',
        preferredEndpointId: 'websocket',
        endpoints: [
          {
            id: 'websocket',
            kind: 'websocket',
            label: 'WebSocket',
            endpoint: 'wss://controller.example',
            deviceToken: 'secret',
            publicKeyB64: 'secret-key'
          }
        ]
      })
    ).toMatchObject({ workspaceViewerMemberKey: 'jake' })
  })
})

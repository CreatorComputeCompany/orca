import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { RUNTIME_GRAPH_METHODS } from './runtime-graph'

describe('runtime graph RPC methods', () => {
  it('publishes a validated web renderer graph to the headless runtime', async () => {
    const runtime = new OrcaRuntimeService()
    const syncWindowGraph = vi.spyOn(runtime, 'syncWindowGraph')
    const dispatcher = new RpcDispatcher({ runtime, methods: RUNTIME_GRAPH_METHODS })
    const graph = {
      rendererGeneration: 'web-renderer-1',
      tabs: [],
      leaves: [],
      mobileSessionTabs: [],
      unchangedMobileSessionWorktrees: []
    }
    const responses: Record<string, unknown>[] = []

    await dispatcher.dispatchStreaming(
      { id: 'sync-1', authToken: '', method: 'runtime.syncWindowGraph', params: graph },
      (response) => responses.push(JSON.parse(response) as Record<string, unknown>),
      { clientKind: 'runtime' }
    )

    expect(responses).toHaveLength(1)
    expect(responses[0]).toMatchObject({ ok: true })
    expect(syncWindowGraph).toHaveBeenCalledWith(0, graph)
  })

  it('rejects mobile callers and unbounded graph arrays', async () => {
    const runtime = new OrcaRuntimeService()
    const dispatcher = new RpcDispatcher({ runtime, methods: RUNTIME_GRAPH_METHODS })
    const dispatch = async (params: unknown, clientKind: 'mobile' | 'runtime') => {
      const responses: Record<string, unknown>[] = []
      await dispatcher.dispatchStreaming(
        { id: 'sync-1', authToken: '', method: 'runtime.syncWindowGraph', params },
        (response) => responses.push(JSON.parse(response) as Record<string, unknown>),
        { clientKind }
      )
      return responses[0]
    }

    await expect(
      dispatch({ rendererGeneration: 'web-renderer-1', tabs: [], leaves: [] }, 'mobile')
    ).resolves.toMatchObject({ ok: false })
    await expect(
      dispatch(
        {
          rendererGeneration: 'web-renderer-1',
          tabs: Array.from({ length: 10_001 }),
          leaves: []
        },
        'runtime'
      )
    ).resolves.toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
  })
})

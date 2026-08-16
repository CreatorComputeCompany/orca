import { z } from 'zod'
import type { RuntimeRendererSyncWindowGraph } from '../../../../shared/runtime-types'
import { HEADLESS_RUNTIME_WINDOW_ID } from '../../../../shared/runtime-types'
import { defineMethod, type RpcAnyMethod } from '../core'

const RuntimeRendererGraph = z
  .object({
    rendererGeneration: z.string().min(1).max(128),
    tabs: z.array(z.unknown()).max(10_000),
    leaves: z.array(z.unknown()).max(10_000),
    mobileSessionTabs: z.array(z.unknown()).max(10_000).optional(),
    unchangedMobileSessionWorktrees: z.array(z.string().min(1).max(2048)).max(10_000).optional()
  })
  .strict()

export const RUNTIME_GRAPH_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'runtime.syncWindowGraph',
    params: RuntimeRendererGraph,
    handler: (graph, { runtime, clientKind }) => {
      if (clientKind !== 'runtime') {
        throw new Error('runtime_graph_sync_requires_runtime_client')
      }
      return runtime.syncWindowGraph(
        HEADLESS_RUNTIME_WINDOW_ID,
        graph as RuntimeRendererSyncWindowGraph
      )
    }
  })
]

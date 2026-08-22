import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../orca-runtime'
import type { RpcRequest } from './core'
import { RpcDispatcher } from './dispatcher'
import { WORKTREE_METHODS } from './methods/worktree'

function request(method: string, params?: unknown): RpcRequest {
  return { id: 'request', authToken: 'token', method, params }
}

describe('member workspace isolation', () => {
  it('rejects another member worktree and allows the authenticated member worktree', async () => {
    const runtime = {
      getRuntimeId: () => 'runtime',
      showManagedWorktree: vi.fn(async (selector: string) => ({
        id: selector,
        ownerMemberKey: selector === 'owned' ? 'member-a' : 'member-b'
      })),
      activateManagedWorktree: vi.fn().mockResolvedValue({ activated: true })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: WORKTREE_METHODS })

    const denied = await dispatch(dispatcher, request('worktree.activate', { worktree: 'guessed' }))
    expect(denied).toMatchObject({ ok: false, error: { message: 'workspace_access_denied' } })
    expect(runtime.activateManagedWorktree).not.toHaveBeenCalled()

    const allowed = await dispatch(dispatcher, request('worktree.activate', { worktree: 'owned' }))
    expect(allowed).toMatchObject({ ok: true })
    expect(runtime.activateManagedWorktree).toHaveBeenCalledOnce()
  })

  it('returns only worktrees owned by the authenticated member', async () => {
    const runtime = {
      getRuntimeId: () => 'runtime',
      listManagedWorktrees: vi.fn().mockResolvedValue({
        worktrees: [
          { id: 'owned', ownerMemberKey: 'member-a' },
          { id: 'other', ownerMemberKey: 'member-b' }
        ],
        totalCount: 2,
        truncated: false
      })
    } as unknown as OrcaRuntimeService
    const result = await dispatch(
      new RpcDispatcher({ runtime, methods: WORKTREE_METHODS }),
      request('worktree.list', { limit: 50 })
    )

    expect(result).toMatchObject({
      ok: true,
      result: {
        worktrees: [{ id: 'owned', ownerMemberKey: 'member-a' }],
        totalCount: 1,
        truncated: false
      }
    })
  })

  it('filters the process catalog to the authenticated member', async () => {
    const runtime = {
      getRuntimeId: () => 'runtime',
      getWorktreePs: vi.fn().mockResolvedValue({
        worktrees: [
          { id: 'owned', ownerMemberKey: 'member-a' },
          { id: 'other', ownerMemberKey: 'member-b' },
          { id: 'legacy' }
        ],
        totalCount: 3,
        truncated: false,
        snapshotId: 'snapshot-1'
      })
    } as unknown as OrcaRuntimeService
    const result = await dispatch(
      new RpcDispatcher({ runtime, methods: WORKTREE_METHODS }),
      request('worktree.ps', { limit: 50 })
    )

    expect(result).toMatchObject({
      ok: true,
      result: {
        worktrees: [{ id: 'owned', ownerMemberKey: 'member-a' }],
        totalCount: 1,
        truncated: false,
        snapshotId: 'snapshot-1'
      }
    })
  })
})

async function dispatch(dispatcher: RpcDispatcher, rpcRequest: RpcRequest): Promise<unknown> {
  const replies: string[] = []
  await dispatcher.dispatchStreaming(rpcRequest, (response) => replies.push(response), {
    workspaceOwnerMemberKey: 'member-a'
  })
  return JSON.parse(replies.at(-1)!)
}

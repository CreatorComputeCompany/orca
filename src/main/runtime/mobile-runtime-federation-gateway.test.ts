import { describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../shared/runtime-rpc-envelope'
import type { RuntimeWorktreePsSummary } from '../../shared/runtime-types'
import {
  decodeTerminalStreamFrame,
  TerminalStreamOpcode,
  type TerminalStreamFrame
} from '../../shared/terminal-stream-protocol'
import { MobileRuntimeFederationGateway } from './mobile-runtime-federation-gateway'

const LOCAL_ID = 'repo::/controller/main'
const CHILD_ID = 'repo::/child/jake-private-proof'

function summary(worktreeId: string, displayName: string): RuntimeWorktreePsSummary {
  return {
    worktreeId,
    repoId: 'repo',
    repo: 'emma',
    path: worktreeId.split('::')[1]!,
    branch: displayName,
    isArchived: false,
    isMainWorktree: false,
    hasHostSidebarActivity: false,
    parentWorktreeId: null,
    childWorktreeIds: [],
    displayName,
    workspaceStatus: 'in_progress',
    sortOrder: 0,
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    comment: '',
    isPinned: false,
    isActive: false,
    unread: false,
    liveTerminalCount: 0,
    hasAttachedPty: false,
    lastOutputAt: null,
    preview: '',
    status: 'inactive',
    agents: []
  }
}

function response(result: unknown): RuntimeRpcResponse<unknown> {
  return { id: 'child-request', ok: true, result, _meta: { runtimeId: 'child-runtime' } }
}

function streamingResponse(result: unknown): RuntimeRpcResponse<unknown> {
  return {
    id: 'child-request',
    ok: true,
    streaming: true,
    result,
    _meta: { runtimeId: 'child-runtime' }
  }
}

function makeGateway(call = vi.fn()) {
  const subscribe = vi.fn()
  const gateway = new MobileRuntimeFederationGateway('controller-runtime', {
    listTargets: () => [{ environmentId: 'env-jake', workspaceId: CHILD_ID }],
    call,
    subscribe
  })
  return { gateway, call, subscribe }
}

describe('MobileRuntimeFederationGateway', () => {
  it('publishes only the workspace attached to each child runtime', async () => {
    const call = vi.fn().mockResolvedValue(
      response({
        worktrees: [summary('repo::/child/main', 'main'), summary(CHILD_ID, 'jake-private-proof')],
        totalCount: 2,
        truncated: false
      })
    )
    const { gateway } = makeGateway(call)

    const result = await gateway.mergeWorktreeCatalog(
      { worktrees: [summary(LOCAL_ID, 'main')], totalCount: 1, truncated: false },
      { limit: 10 }
    )

    expect(result).toMatchObject({
      worktrees: [
        { worktreeId: LOCAL_ID },
        { worktreeId: CHILD_ID, displayName: 'jake-private-proof' }
      ],
      totalCount: 2,
      truncated: false
    })
  })

  it('retains the last child catalog while its Boxd runtime reconnects', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          worktrees: [summary(CHILD_ID, 'jake-private-proof')],
          totalCount: 1,
          truncated: false
        })
      )
      .mockRejectedValueOnce(new Error('reconnecting'))
    const { gateway } = makeGateway(call)
    const local = { worktrees: [], totalCount: 0, truncated: false }

    await gateway.mergeWorktreeCatalog(local, { limit: 10 })
    const duringReconnect = await gateway.mergeWorktreeCatalog(local, { limit: 10 })

    expect(duringReconnect).toMatchObject({ worktrees: [{ worktreeId: CHILD_ID }] })
  })

  it('routes workspace and discovered terminal operations to the owning child', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          worktrees: [summary(CHILD_ID, 'jake-private-proof')],
          totalCount: 1,
          truncated: false
        })
      )
      .mockResolvedValueOnce(response({ terminals: [{ handle: 'terminal-jake' }] }))
      .mockResolvedValueOnce(response({ send: { accepted: true } }))
    const { gateway } = makeGateway(call)
    await gateway.mergeWorktreeCatalog(
      { worktrees: [], totalCount: 0, truncated: false },
      { limit: 10 }
    )
    const replies: string[] = []
    const context = {
      sendBinary: vi.fn(),
      registerBinaryStreamHandler: vi.fn(() => vi.fn())
    }

    await expect(
      gateway.tryForward(
        {
          id: 'list',
          authToken: 'unused',
          method: 'terminal.list',
          params: { worktree: `id:${CHILD_ID}` }
        },
        (reply) => replies.push(reply),
        context
      )
    ).resolves.toBe(true)
    await gateway.tryForward(
      {
        id: 'send',
        authToken: 'unused',
        method: 'terminal.send',
        params: { terminal: 'terminal-jake', text: 'hi', enter: true }
      },
      (reply) => replies.push(reply),
      context
    )

    expect(call).toHaveBeenNthCalledWith(2, 'env-jake', 'terminal.list', {
      worktree: `id:${CHILD_ID}`
    })
    expect(call).toHaveBeenNthCalledWith(3, 'env-jake', 'terminal.send', {
      terminal: 'terminal-jake',
      text: 'hi',
      enter: true
    })
    expect(JSON.parse(replies[1]!)).toMatchObject({
      id: 'send',
      ok: true,
      _meta: { runtimeId: 'controller-runtime' }
    })
  })

  it('bridges terminal stream output and input until mobile unsubscribes', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          worktrees: [summary(CHILD_ID, 'jake-private-proof')],
          totalCount: 1,
          truncated: false
        })
      )
      .mockResolvedValueOnce(response({ terminals: [{ handle: 'terminal-jake' }] }))
    const { gateway, subscribe } = makeGateway(call)
    await gateway.mergeWorktreeCatalog(
      { worktrees: [], totalCount: 0, truncated: false },
      { limit: 10 }
    )
    const context = {
      connectionId: 'mobile-connection',
      sendBinary: vi.fn(),
      registerBinaryStreamHandler: vi.fn()
    }
    await gateway.tryForward(
      {
        id: 'list',
        authToken: 'unused',
        method: 'terminal.list',
        params: { worktree: `id:${CHILD_ID}` }
      },
      vi.fn(),
      context as never
    )

    let closeChild = (): void => {}
    let childCallbacks: Parameters<typeof subscribe>[3]
    const childSendBinary = vi.fn((_bytes: Uint8Array<ArrayBufferLike>) => true)
    subscribe.mockImplementation(async (_environmentId, _method, _params, callbacks) => {
      childCallbacks = callbacks
      return {
        requestId: 'child-subscription',
        close: () => {
          closeChild()
          callbacks.onClose()
        },
        sendBinary: childSendBinary
      }
    })
    let parentInput: ((frame: TerminalStreamFrame) => void) | undefined
    context.registerBinaryStreamHandler.mockImplementation((_streamId, handler) => {
      parentInput = handler
      return vi.fn()
    })
    const replies: string[] = []
    const pending = gateway.tryForward(
      {
        id: 'subscribe',
        authToken: 'unused',
        method: 'terminal.subscribe',
        params: { terminal: 'terminal-jake' }
      },
      (reply) => replies.push(reply),
      context as never
    )
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce())

    childCallbacks!.onEvent({
      type: 'response',
      response: streamingResponse({ type: 'subscribed', streamId: 7, lines: [] })
    })
    const output = new Uint8Array([1, 2, 3])
    childCallbacks!.onEvent({ type: 'binary', bytes: output })
    parentInput!({
      opcode: TerminalStreamOpcode.Input,
      streamId: 7,
      seq: 0,
      payload: new Uint8Array([4, 5])
    })

    expect(context.sendBinary).toHaveBeenCalledWith(output)
    expect(decodeTerminalStreamFrame(childSendBinary.mock.calls[0]![0]!)).toMatchObject({
      opcode: TerminalStreamOpcode.Input,
      streamId: 7,
      payload: new Uint8Array([4, 5])
    })
    expect(JSON.parse(replies[0]!)).toMatchObject({
      id: 'subscribe',
      streaming: true,
      result: { type: 'subscribed', streamId: 7 }
    })

    await gateway.tryForward(
      {
        id: 'unsubscribe',
        authToken: 'unused',
        method: 'terminal.unsubscribe',
        params: { terminal: 'terminal-jake' }
      },
      (reply) => replies.push(reply),
      context as never
    )
    await pending
    expect(replies.map((reply) => JSON.parse(reply))).toContainEqual(
      expect.objectContaining({ id: 'unsubscribe', result: { unsubscribed: true } })
    )
  })
})

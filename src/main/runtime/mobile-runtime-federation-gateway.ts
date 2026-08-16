import type { RuntimeRpcResponse } from '../../shared/runtime-rpc-envelope'
import type {
  RuntimeWorktreePsConditionalResult,
  RuntimeWorktreePsResult,
  RuntimeWorktreePsSummary
} from '../../shared/runtime-types'
import type { RemoteRuntimeSubscription } from '../../shared/remote-runtime-client'
import {
  encodeTerminalStreamFrame,
  type TerminalStreamFrame
} from '../../shared/terminal-stream-protocol'
import type { RpcRequest } from './rpc/core'
import { errorResponse, successResponse } from './rpc/errors'
import { resolveWorktreeCatalogSnapshot } from './rpc/worktree-catalog-snapshot'
import {
  createMobileRuntimeFederationDependencies,
  type MobileRuntimeFederationDependencies
} from './mobile-runtime-federation-dependencies'
import {
  asFederationRecord,
  federatedResponseEndsStream,
  federatedResponseStreamId,
  firstFederationString,
  isForwardedSubscription,
  isSubscriptionCleanup,
  isTerminalHandleKey,
  isWorktreeSummary,
  normalizeFederatedWorktreeLimit,
  stripFederatedSelectorPrefix,
  visitFederatedResponseValues
} from './mobile-runtime-federation-routing'
import { MobileRuntimeFederationOwnerIndex } from './mobile-runtime-federation-owner-index'
import { normalizeFederatedRuntimeResponse } from './mobile-runtime-federation-response'

export type MobileRuntimeFederationContext = {
  pairedDeviceId?: string
  connectionId?: string
  signal?: AbortSignal
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
  registerBinaryStreamHandler: (
    streamId: number,
    handler: (frame: TerminalStreamFrame) => void
  ) => () => void
}

export class MobileRuntimeFederationGateway {
  private readonly owners = new MobileRuntimeFederationOwnerIndex()
  private readonly childCatalogs = new Map<string, RuntimeWorktreePsSummary[]>()
  private readonly subscriptions = new Map<string, RemoteRuntimeSubscription>()

  constructor(
    private readonly runtimeId: string,
    private readonly dependencies: MobileRuntimeFederationDependencies
  ) {}

  static forUserDataPath(runtimeId: string, userDataPath: string): MobileRuntimeFederationGateway {
    return new MobileRuntimeFederationGateway(
      runtimeId,
      createMobileRuntimeFederationDependencies(userDataPath)
    )
  }

  async mergeWorktreeCatalog(
    local: RuntimeWorktreePsResult,
    params: { limit?: number; afterSnapshotId?: string | null },
    pairedDeviceId?: string
  ): Promise<RuntimeWorktreePsConditionalResult> {
    const ownerKey = pairedDeviceId ?? 'host'
    const targets = this.dependencies.listTargets(pairedDeviceId)
    const liveEnvironmentIds = new Set(
      targets.map(({ environmentId }) => this.scopedKey(ownerKey, environmentId))
    )
    for (const catalogKey of this.childCatalogs.keys()) {
      if (catalogKey.startsWith(`${ownerKey}:`) && !liveEnvironmentIds.has(catalogKey)) {
        this.childCatalogs.delete(catalogKey)
      }
    }

    await Promise.all(
      targets.map(async (target) => {
        try {
          const response = await this.dependencies.call(target.environmentId, 'worktree.ps', {
            limit: 10_000
          })
          if (!response.ok) {
            return
          }
          const result = response.result as Partial<RuntimeWorktreePsResult>
          if (!Array.isArray(result.worktrees)) {
            return
          }
          const rows = result.worktrees.filter(
            (worktree): worktree is RuntimeWorktreePsSummary =>
              isWorktreeSummary(worktree) && worktree.worktreeId === target.workspaceId
          )
          this.childCatalogs.set(this.scopedKey(ownerKey, target.environmentId), rows)
        } catch {
          // Why: retain the last confirmed child catalog through a transient Boxd reconnect.
        }
      })
    )

    this.owners.clearWorktrees(ownerKey)
    const childRows = targets.flatMap(({ environmentId }) => {
      const rows = this.childCatalogs.get(this.scopedKey(ownerKey, environmentId)) ?? []
      for (const row of rows) {
        this.owners.setWorktree(ownerKey, row.worktreeId, environmentId)
      }
      return rows
    })
    const allRows = [...local.worktrees, ...childRows]
    const limit = normalizeFederatedWorktreeLimit(params.limit, allRows.length)
    const result: RuntimeWorktreePsResult = {
      worktrees: allRows.slice(0, limit),
      totalCount: allRows.length,
      truncated: local.truncated || allRows.length > limit
    }
    return resolveWorktreeCatalogSnapshot(result, params.afterSnapshotId ?? null)
  }

  async tryForward(
    request: RpcRequest,
    reply: (response: string) => void,
    context: MobileRuntimeFederationContext
  ): Promise<boolean> {
    const ownerKey = context.pairedDeviceId ?? 'host'
    const environmentId = this.resolveRequestOwner(request, ownerKey)
    if (!environmentId) {
      return false
    }
    if (isSubscriptionCleanup(request.method)) {
      this.closeSubscriptions(request, context.connectionId)
      reply(JSON.stringify(successResponse(request.id, this.meta(), { unsubscribed: true })))
      return true
    }
    if (isForwardedSubscription(request.method)) {
      await this.forwardSubscription(environmentId, request, reply, context)
      return true
    }
    try {
      const response = await this.dependencies.call(
        environmentId,
        request.method,
        request.params ?? {}
      )
      this.recordResourceOwners(environmentId, response, ownerKey)
      reply(JSON.stringify(normalizeFederatedRuntimeResponse(request.id, response, this.runtimeId)))
    } catch (error) {
      reply(
        JSON.stringify(
          errorResponse(
            request.id,
            this.meta(),
            'runtime_unavailable',
            error instanceof Error ? error.message : String(error)
          )
        )
      )
    }
    return true
  }

  private async forwardSubscription(
    environmentId: string,
    request: RpcRequest,
    reply: (response: string) => void,
    context: MobileRuntimeFederationContext
  ): Promise<void> {
    const subscriptionKey = this.subscriptionKey(request, context.connectionId)
    this.subscriptions.get(subscriptionKey)?.close()
    let unregisterBinary = (): void => {}
    let settled = false
    let finish = (): void => {}
    const closed = new Promise<void>((resolve) => {
      finish = resolve
    })
    const close = (): void => {
      if (settled) {
        return
      }
      settled = true
      unregisterBinary()
      this.subscriptions.delete(subscriptionKey)
      finish()
    }
    const onAbort = (): void => this.subscriptions.get(subscriptionKey)?.close()
    context.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const subscription = await this.dependencies.subscribe(
        environmentId,
        request.method,
        request.params ?? {},
        {
          onEvent: (event) => {
            if (event.type === 'binary') {
              context.sendBinary(event.bytes)
              return
            }
            if (event.type === 'response') {
              this.recordResourceOwners(
                environmentId,
                event.response,
                context.pairedDeviceId ?? 'host'
              )
              const streamId = federatedResponseStreamId(event.response)
              if (streamId !== null) {
                unregisterBinary()
                unregisterBinary = context.registerBinaryStreamHandler(streamId, (frame) => {
                  this.subscriptions
                    .get(subscriptionKey)
                    ?.sendBinary(encodeTerminalStreamFrame(frame))
                })
              }
              reply(
                JSON.stringify(
                  normalizeFederatedRuntimeResponse(request.id, event.response, this.runtimeId)
                )
              )
              if (federatedResponseEndsStream(event.response)) {
                this.subscriptions.get(subscriptionKey)?.close()
              }
              return
            }
            if (event.type === 'error') {
              reply(
                JSON.stringify(errorResponse(request.id, this.meta(), event.code, event.message))
              )
            }
          },
          onClose: close
        }
      )
      if (settled || context.signal?.aborted) {
        subscription.close()
      } else {
        this.subscriptions.set(subscriptionKey, subscription)
      }
      await closed
    } catch (error) {
      reply(
        JSON.stringify(
          errorResponse(
            request.id,
            this.meta(),
            'runtime_unavailable',
            error instanceof Error ? error.message : String(error)
          )
        )
      )
    } finally {
      context.signal?.removeEventListener('abort', onAbort)
      close()
    }
  }

  private resolveRequestOwner(request: RpcRequest, ownerKey: string): string | null {
    const params = asFederationRecord(request.params)
    const worktree = firstFederationString(params, ['worktree', 'worktreeId'])
    if (worktree) {
      const owner = this.owners.resolveWorktree(ownerKey, stripFederatedSelectorPrefix(worktree))
      if (owner) {
        return owner
      }
    }
    const terminal = firstFederationString(params, ['terminal', 'expectedTerminal'])
    return terminal ? this.owners.resolveTerminal(ownerKey, terminal) : null
  }

  private recordResourceOwners(
    environmentId: string,
    response: RuntimeRpcResponse<unknown>,
    ownerKey: string
  ): void {
    if (!response.ok) {
      return
    }
    visitFederatedResponseValues(response.result, (key, value) => {
      if (typeof value === 'string' && isTerminalHandleKey(key)) {
        this.owners.setTerminal(ownerKey, value, environmentId)
      }
    })
  }

  private scopedKey(ownerKey: string, resource: string): string {
    return `${ownerKey}:${resource}`
  }

  private closeSubscriptions(request: RpcRequest, connectionId?: string): void {
    const params = asFederationRecord(request.params)
    const resource =
      firstFederationString(params, ['terminal']) ??
      firstFederationString(params, ['worktree', 'worktreeId'])?.replace(/^id:/, '')
    if (!resource) {
      return
    }
    const prefix = `${connectionId ?? 'unknown'}:`
    for (const [key, subscription] of this.subscriptions) {
      if (key.startsWith(prefix) && key.endsWith(`:${resource}`)) {
        subscription.close()
      }
    }
  }

  private subscriptionKey(request: RpcRequest, connectionId?: string): string {
    const params = asFederationRecord(request.params)
    const resource =
      firstFederationString(params, ['terminal']) ??
      firstFederationString(params, ['worktree', 'worktreeId'])?.replace(/^id:/, '') ??
      request.id
    return `${connectionId ?? 'unknown'}:${request.method}:${resource}`
  }

  private meta(): { runtimeId: string } {
    return { runtimeId: this.runtimeId }
  }
}

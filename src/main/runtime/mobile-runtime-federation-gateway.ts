import type { RuntimeRpcResponse } from '../../shared/runtime-rpc-envelope'
import type {
  RuntimeWorktreePsConditionalResult,
  RuntimeWorktreePsResult,
  RuntimeWorktreePsSummary
} from '../../shared/runtime-types'
import type { RpcRequest } from './rpc/core'
import { errorResponse, successResponse } from './rpc/errors'
import { resolveWorktreeCatalogSnapshot } from './rpc/worktree-catalog-snapshot'
import {
  createMobileRuntimeFederationDependencies,
  type MobileRuntimeFederationDependencies
} from './mobile-runtime-federation-dependencies'
import {
  asFederationRecord,
  firstFederationString,
  isForwardedSubscription,
  isSubscriptionCleanup,
  isTerminalHandleKey,
  isWorktreeSummary,
  normalizeFederatedWorktreeLimit,
  stripFederatedSelectorPrefix,
  visitFederatedResponseValues
} from './mobile-runtime-federation-routing'
import {
  canAccessFederatedEnvironment,
  MobileRuntimeFederationAccess
} from './mobile-runtime-federation-access'
import { MobileRuntimeFederationOwnerIndex } from './mobile-runtime-federation-owner-index'
import { normalizeFederatedRuntimeResponse } from './mobile-runtime-federation-response'
import {
  forwardMobileRuntimeSubscription,
  type MobileRuntimeFederationContext
} from './mobile-runtime-federation-subscription'

export class MobileRuntimeFederationGateway {
  private readonly owners = new MobileRuntimeFederationOwnerIndex()
  private readonly childCatalogs = new Map<string, RuntimeWorktreePsSummary[]>()
  private readonly access = new MobileRuntimeFederationAccess()

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
    this.access.rememberOwner(ownerKey)
    const targets = this.dependencies.listTargets(pairedDeviceId)
    const liveEnvironmentIds = new Set(targets.map(({ environmentId }) => environmentId))
    this.access.reconcileOwner(
      ownerKey,
      this.catalogEnvironmentIds(ownerKey),
      liveEnvironmentIds,
      (revokedOwnerKey, environmentId) =>
        this.revokeOwnerEnvironmentState(revokedOwnerKey, environmentId)
    )
    for (const catalogKey of this.childCatalogs.keys()) {
      if (
        catalogKey.startsWith(`${ownerKey}:`) &&
        !liveEnvironmentIds.has(catalogKey.slice(ownerKey.length + 1))
      ) {
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
    this.access.rememberOwner(ownerKey)
    const environmentId = this.resolveRequestOwner(request, ownerKey)
    if (!environmentId) {
      return false
    }
    if (
      !canAccessFederatedEnvironment(environmentId, () =>
        this.dependencies.listTargets(context.pairedDeviceId).map((target) => target.environmentId)
      )
    ) {
      this.revokeOwnerEnvironmentState(ownerKey, environmentId)
      reply(
        JSON.stringify(
          errorResponse(
            request.id,
            this.meta(),
            'forbidden',
            'This workspace is no longer shared with this mobile device.'
          )
        )
      )
      return true
    }
    if (isSubscriptionCleanup(request.method)) {
      this.closeSubscriptions(request, context.connectionId)
      reply(JSON.stringify(successResponse(request.id, this.meta(), { unsubscribed: true })))
      return true
    }
    if (isForwardedSubscription(request.method)) {
      await forwardMobileRuntimeSubscription({
        access: this.access,
        context,
        dependencies: this.dependencies,
        environmentId,
        request,
        reply,
        runtimeId: this.runtimeId,
        recordResponse: (response) => this.recordResourceOwners(environmentId, response, ownerKey)
      })
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

  revokeEnvironmentAccess(environmentId: string, retainOwnerKeys: ReadonlySet<string>): void {
    this.access.revokeEnvironment(
      environmentId,
      retainOwnerKeys,
      (ownerKey, revokedEnvironmentId) =>
        this.revokeOwnerEnvironmentState(ownerKey, revokedEnvironmentId)
    )
  }

  private catalogEnvironmentIds(ownerKey: string): string[] {
    const environmentIds: string[] = []
    for (const catalogKey of this.childCatalogs.keys()) {
      if (catalogKey.startsWith(`${ownerKey}:`)) {
        environmentIds.push(catalogKey.slice(ownerKey.length + 1))
      }
    }
    return environmentIds
  }

  private revokeOwnerEnvironmentState(ownerKey: string, environmentId: string): void {
    this.childCatalogs.delete(this.scopedKey(ownerKey, environmentId))
    this.owners.clearEnvironment(ownerKey, environmentId)
  }

  private closeSubscriptions(request: RpcRequest, connectionId?: string): void {
    const params = asFederationRecord(request.params)
    const resource =
      firstFederationString(params, ['terminal']) ??
      firstFederationString(params, ['worktree', 'worktreeId'])?.replace(/^id:/, '')
    if (!resource) {
      return
    }
    this.access.closeResource(connectionId, resource)
  }

  private meta(): { runtimeId: string } {
    return { runtimeId: this.runtimeId }
  }
}

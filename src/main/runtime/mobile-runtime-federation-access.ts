import type { RemoteRuntimeSubscription } from '../../shared/remote-runtime-client'

type SubscriptionRecord = {
  environmentId: string
  ownerKey: string
  subscription: RemoteRuntimeSubscription
}

export class MobileRuntimeFederationAccess {
  private readonly ownerKeys = new Set<string>()
  private readonly subscriptions = new Map<string, SubscriptionRecord>()

  rememberOwner(ownerKey: string): void {
    this.ownerKeys.add(ownerKey)
  }

  getSubscription(key: string): RemoteRuntimeSubscription | undefined {
    return this.subscriptions.get(key)?.subscription
  }

  setSubscription(key: string, record: SubscriptionRecord): void {
    this.subscriptions.set(key, record)
  }

  deleteSubscription(key: string): void {
    this.subscriptions.delete(key)
  }

  reconcileOwner(
    ownerKey: string,
    knownEnvironmentIds: Iterable<string>,
    liveEnvironmentIds: ReadonlySet<string>,
    revokeState: (ownerKey: string, environmentId: string) => void
  ): void {
    const environments = new Set(knownEnvironmentIds)
    for (const record of this.subscriptions.values()) {
      if (record.ownerKey === ownerKey) {
        environments.add(record.environmentId)
      }
    }
    for (const environmentId of environments) {
      if (!liveEnvironmentIds.has(environmentId)) {
        this.revokeOwnerEnvironment(ownerKey, environmentId, revokeState)
      }
    }
  }

  revokeEnvironment(
    environmentId: string,
    retainOwnerKeys: ReadonlySet<string>,
    revokeState: (ownerKey: string, environmentId: string) => void
  ): void {
    for (const ownerKey of this.ownerKeys) {
      if (!retainOwnerKeys.has(ownerKey)) {
        this.revokeOwnerEnvironment(ownerKey, environmentId, revokeState)
      }
    }
  }

  closeResource(connectionId: string | undefined, resource: string): void {
    const prefix = `${connectionId ?? 'unknown'}:`
    for (const [key, record] of this.subscriptions) {
      if (key.startsWith(prefix) && key.endsWith(`:${resource}`)) {
        record.subscription.close()
      }
    }
  }

  private revokeOwnerEnvironment(
    ownerKey: string,
    environmentId: string,
    revokeState: (ownerKey: string, environmentId: string) => void
  ): void {
    revokeState(ownerKey, environmentId)
    for (const record of this.subscriptions.values()) {
      if (record.ownerKey === ownerKey && record.environmentId === environmentId) {
        record.subscription.close()
      }
    }
  }
}

export function canAccessFederatedEnvironment(
  environmentId: string,
  listEnvironmentIds: () => Iterable<string>
): boolean {
  try {
    return new Set(listEnvironmentIds()).has(environmentId)
  } catch {
    return false
  }
}

import type { EphemeralVmRuntimeRecord } from '../shared/ephemeral-vm-runtimes'
import type { WorkspaceCreatorProvenance } from '../shared/worktree/types'

export type EphemeralVmRuntimeCatalogEvent = {
  type: 'snapshot' | 'updated'
  runtimes: EphemeralVmRuntimeRecord[]
}

type Subscription = {
  actor: WorkspaceCreatorProvenance
  emit: (event: EphemeralVmRuntimeCatalogEvent) => void
  lastSnapshotJson: string | null
  refreshing: Promise<void> | null
  refreshAgain: boolean
}

const PRESENCE_REFRESH_MS = 1_000

export class EphemeralVmRuntimeCatalogPublisher {
  private readonly subscriptions = new Set<Subscription>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly listRuntimes: (
      actor: WorkspaceCreatorProvenance
    ) => Promise<EphemeralVmRuntimeRecord[]>
  ) {}

  async subscribe(
    actor: WorkspaceCreatorProvenance,
    emit: (event: EphemeralVmRuntimeCatalogEvent) => void
  ): Promise<() => void> {
    const subscription: Subscription = {
      actor,
      emit,
      lastSnapshotJson: null,
      refreshing: null,
      refreshAgain: false
    }
    this.subscriptions.add(subscription)
    this.startTimer()
    try {
      await this.refresh(subscription, true)
    } catch (error) {
      this.subscriptions.delete(subscription)
      this.stopTimerIfIdle()
      throw error
    }
    return () => {
      this.subscriptions.delete(subscription)
      this.stopTimerIfIdle()
    }
  }

  notifyChanged(): void {
    for (const subscription of this.subscriptions) {
      void this.refresh(subscription, false).catch((error) => {
        console.warn('[ephemeral-vm] Failed to publish runtime catalog update:', error)
      })
    }
  }

  private async refresh(subscription: Subscription, initial: boolean): Promise<void> {
    if (subscription.refreshing) {
      subscription.refreshAgain = true
      return subscription.refreshing
    }
    subscription.refreshing = this.refreshOnce(subscription, initial).finally(() => {
      subscription.refreshing = null
      if (subscription.refreshAgain && this.subscriptions.has(subscription)) {
        subscription.refreshAgain = false
        void this.refresh(subscription, false).catch((error) => {
          console.warn('[ephemeral-vm] Failed to republish runtime catalog update:', error)
        })
      }
    })
    return subscription.refreshing
  }

  private async refreshOnce(subscription: Subscription, initial: boolean): Promise<void> {
    const runtimes = await this.listRuntimes(subscription.actor)
    if (!this.subscriptions.has(subscription)) {
      return
    }
    const snapshotJson = JSON.stringify(runtimes)
    if (!initial && snapshotJson === subscription.lastSnapshotJson) {
      return
    }
    subscription.lastSnapshotJson = snapshotJson
    subscription.emit({ type: initial ? 'snapshot' : 'updated', runtimes })
  }

  private startTimer(): void {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => this.notifyChanged(), PRESENCE_REFRESH_MS)
    this.timer.unref?.()
  }

  private stopTimerIfIdle(): void {
    if (this.subscriptions.size > 0 || !this.timer) {
      return
    }
    clearInterval(this.timer)
    this.timer = null
  }
}

import { useEffect } from 'react'
import { useAppStore } from '@/store'

const MULTIPLAYER_PRESENCE_REFRESH_MS = 5_000

export function useMultiplayerPresenceRefresh(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return
    }
    const publish = (
      environments: Awaited<ReturnType<typeof window.api.runtimeEnvironments.list>>
    ): void => {
      useAppStore.getState().setRuntimeEnvironments(environments)
    }
    const subscribe = window.api.ephemeralVm.onRuntimesChanged
    if (subscribe) {
      return subscribe(publish)
    }
    const refresh = (): void => {
      if (document.visibilityState === 'hidden') {
        return
      }
      void window.api.runtimeEnvironments
        .list()
        .then(publish)
        .catch(() => undefined)
    }
    const interval = window.setInterval(refresh, MULTIPLAYER_PRESENCE_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [enabled])
}

import { useEffect } from 'react'
import { useAppStore } from '@/store'

const MULTIPLAYER_PRESENCE_REFRESH_MS = 5_000

export function useMultiplayerPresenceRefresh(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return
    }
    const refresh = (): void => {
      if (document.visibilityState === 'hidden') {
        return
      }
      void window.api.runtimeEnvironments
        .list()
        .then((environments) => useAppStore.getState().setRuntimeEnvironments(environments))
        .catch(() => undefined)
    }
    const interval = window.setInterval(refresh, MULTIPLAYER_PRESENCE_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [enabled])
}

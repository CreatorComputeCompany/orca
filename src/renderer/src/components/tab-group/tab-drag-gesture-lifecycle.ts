import { useCallback, useRef, type RefObject } from 'react'
import { acquireWebviewsDragPassthrough } from '../browser-pane/webview-registry'

/** Global side effects a tab drag holds while in flight: webview pointer
 *  passthrough plus the window-level fallback for a missed drag end. Both refs
 *  are injected so this stays independent of the drag state machine. */
export function useTabDragGestureLifecycle({
  clearDragStateRef,
  tabDragActiveRef
}: {
  clearDragStateRef: RefObject<() => void>
  tabDragActiveRef: RefObject<boolean>
}): {
  acquireWebviewDragPassthrough: () => void
  installMissedEndFallback: () => void
  releaseMissedEndFallback: () => void
  releaseWebviewDragPassthrough: () => void
  setDragRootNode: (node: HTMLDivElement | null) => void
} {
  const releaseWebviewDragPassthroughRef = useRef<(() => void) | null>(null)
  const releaseMissedEndFallbackRef = useRef<(() => void) | null>(null)

  const releaseWebviewDragPassthrough = useCallback(() => {
    releaseWebviewDragPassthroughRef.current?.()
    releaseWebviewDragPassthroughRef.current = null
  }, [])

  const releaseMissedEndFallback = useCallback(() => {
    releaseMissedEndFallbackRef.current?.()
    releaseMissedEndFallbackRef.current = null
  }, [])

  const installMissedEndFallback = useCallback(() => {
    releaseMissedEndFallback()

    let cleanupTimer: number | null = null
    const clearIfDndMissedEnd = (): void => {
      if (cleanupTimer !== null) {
        window.clearTimeout(cleanupTimer)
      }
      cleanupTimer = window.setTimeout(() => {
        cleanupTimer = null
        if (tabDragActiveRef.current) {
          // Why: Electron/dnd-kit can occasionally miss drag end/cancel; a
          // stuck drag ref makes all later tab clicks look like drag releases.
          clearDragStateRef.current()
        }
      }, 0)
    }

    window.addEventListener('pointerup', clearIfDndMissedEnd)
    window.addEventListener('pointercancel', clearIfDndMissedEnd)
    window.addEventListener('blur', clearIfDndMissedEnd)
    window.addEventListener('focus', clearIfDndMissedEnd)
    releaseMissedEndFallbackRef.current = () => {
      if (cleanupTimer !== null) {
        window.clearTimeout(cleanupTimer)
      }
      window.removeEventListener('pointerup', clearIfDndMissedEnd)
      window.removeEventListener('pointercancel', clearIfDndMissedEnd)
      window.removeEventListener('blur', clearIfDndMissedEnd)
      window.removeEventListener('focus', clearIfDndMissedEnd)
    }
  }, [clearDragStateRef, releaseMissedEndFallback, tabDragActiveRef])

  const acquireWebviewDragPassthrough = useCallback(() => {
    // Why: dnd-kit tab drags are pointer-driven, so the native drag listeners
    // in webview-registry never fire. Put webviews in passthrough explicitly.
    releaseWebviewDragPassthrough()
    releaseWebviewDragPassthroughRef.current = acquireWebviewsDragPassthrough()
  }, [releaseWebviewDragPassthrough])

  const setDragRootNode = useCallback(
    (node: HTMLDivElement | null): void => {
      if (node) {
        return
      }
      // Why: this root owns the dnd-kit gesture that temporarily puts browser
      // webviews in pointer passthrough and installs global fallback listeners,
      // so root teardown must release both.
      releaseWebviewDragPassthrough()
      releaseMissedEndFallback()
    },
    [releaseMissedEndFallback, releaseWebviewDragPassthrough]
  )

  return {
    acquireWebviewDragPassthrough,
    installMissedEndFallback,
    releaseMissedEndFallback,
    releaseWebviewDragPassthrough,
    setDragRootNode
  }
}

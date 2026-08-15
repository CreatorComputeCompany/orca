import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import type { editor } from 'monaco-editor'
import { syncContentUpdate, type MonacoContentSyncMode } from './monaco-content-sync'
import {
  beginProgrammaticContentSync,
  endProgrammaticContentSync,
  shouldIgnoreMonacoContentChange
} from './monaco-programmatic-sync'

export type MonacoContentSyncBridge = {
  contentRef: MutableRefObject<string>
  lastSyncedContentRef: MutableRefObject<string>
  contentSyncModeRef: MutableRefObject<MonacoContentSyncMode>
  isApplyingProgrammaticContentRef: MutableRefObject<boolean>
  isApplyingLargePasteRef: MutableRefObject<boolean>
  handleChange: (value: string | undefined) => void
}

export function useMonacoContentSyncBridge(params: {
  editorRef: MutableRefObject<editor.IStandaloneCodeEditor | null>
  content: string
  filePath: string
  readOnly: boolean
  liveTail: boolean
  onContentChange: (content: string) => void
}): MonacoContentSyncBridge {
  const { editorRef, content, filePath, readOnly, liveTail, onContentChange } = params

  const contentSyncModeRef = useRef<MonacoContentSyncMode>('undoable')
  contentSyncModeRef.current = readOnly && liveTail ? 'read-only-live-tail' : 'undoable'

  // Why: @monaco-editor/react skips its value→model sync on the first post-remount render, so retained models need an explicit sync or they show stale text.
  // Invariant: the mount path must read `contentRef.current` (guaranteed latest), never `lastSyncedContentRef.current` (may be stale pre-mount).
  const contentRef = useRef(content)
  contentRef.current = content
  const lastSyncedContentRef = useRef<string>(content)

  // Why: reconciliation uses real edit ops (to keep undo sane), so these programmatic edits must suppress onChange or they'd mark the file dirty.
  const isApplyingProgrammaticContentRef = useRef(false)
  const isApplyingLargePasteRef = useRef(false)

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        // Why: split panes share one retained model, so a sibling must ignore the echoed programmatic-sync onChange or it marks the file dirty.
        if (isApplyingLargePasteRef.current) {
          lastSyncedContentRef.current = value
          return
        }
        if (
          shouldIgnoreMonacoContentChange({
            filePath,
            isApplyingProgrammaticContent: isApplyingProgrammaticContentRef.current
          })
        ) {
          return
        }
        lastSyncedContentRef.current = value
        onContentChange(value)
      }
    },
    [filePath, onContentChange]
  )

  // Why: sync the model on external `content` drift; useLayoutEffect lands the overwrite before paint so no stale text flashes. On-mount handled in handleMount.
  useLayoutEffect(() => {
    const ed = editorRef.current
    if (!ed || lastSyncedContentRef.current === content) {
      return
    }
    beginProgrammaticContentSync(filePath)
    isApplyingProgrammaticContentRef.current = true
    try {
      syncContentUpdate(ed, content, contentSyncModeRef.current)
      lastSyncedContentRef.current = content
    } finally {
      isApplyingProgrammaticContentRef.current = false
      endProgrammaticContentSync(filePath)
    }
  }, [content, editorRef, filePath])

  return {
    contentRef,
    lastSyncedContentRef,
    contentSyncModeRef,
    isApplyingProgrammaticContentRef,
    isApplyingLargePasteRef,
    handleChange
  }
}

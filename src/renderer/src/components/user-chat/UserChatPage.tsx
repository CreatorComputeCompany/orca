import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUserChatState } from './user-chat-store'

type SurfaceState =
  | { channelId: null; status: 'idle'; url: null; error: null }
  | { channelId: string; status: 'loading'; url: null; error: null }
  | { channelId: string; status: 'ready'; url: string; error: null }
  | { channelId: string; status: 'error'; url: null; error: string }

export default function UserChatPage(): React.JSX.Element {
  const chat = useUserChatState()
  const channel = chat.channels.find((candidate) => candidate.id === chat.selectedChannelId) ?? null
  const channelId = channel?.id ?? null
  const [revision, setRevision] = useState(0)
  const [surface, setSurface] = useState<SurfaceState>({
    channelId: null,
    status: 'idle',
    url: null,
    error: null
  })

  useEffect(() => {
    if (!channelId || !window.api.userChat) {
      setSurface({ channelId: null, status: 'idle', url: null, error: null })
      return
    }
    let cancelled = false
    setSurface({ channelId, status: 'loading', url: null, error: null })
    void window.api.userChat
      .surface({ channelId })
      .then(({ url }) => {
        if (!cancelled) {
          setSurface({ channelId, status: 'ready', url, error: null })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSurface({
            channelId,
            status: 'error',
            url: null,
            error: error instanceof Error ? error.message : 'Unable to open Buzz.'
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [channelId, revision])

  if (!channel) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background text-sm text-muted-foreground">
        Select a channel or direct message from the sidebar.
      </div>
    )
  }

  if (surface.status === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-background text-sm text-muted-foreground">
        <span>{surface.error}</span>
        <Button type="button" variant="secondary" onClick={() => setRevision((value) => value + 1)}>
          <RefreshCw className="size-4" />
          Retry
        </Button>
      </div>
    )
  }

  if (surface.status !== 'ready' || surface.channelId !== channelId) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-label="Opening Buzz conversation" />
      </div>
    )
  }

  return (
    <iframe
      key={surface.url}
      src={surface.url}
      title="Buzz conversation"
      className="min-h-0 min-w-0 flex-1 border-0 bg-background"
      allow="camera; microphone; clipboard-read; clipboard-write"
      referrerPolicy="no-referrer"
    />
  )
}

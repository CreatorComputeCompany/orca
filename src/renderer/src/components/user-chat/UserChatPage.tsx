import { useEffect, useRef, useState } from 'react'
import { Hash, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  loadUserChatHistory,
  sendUserChatMessage,
  useUserChatState,
  userChatChannelLabel
} from './user-chat-store'

const CHAT_REFRESH_INTERVAL_MS = 2_000

export default function UserChatPage(): React.JSX.Element {
  const chat = useUserChatState()
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const channel = chat.channels.find((candidate) => candidate.id === chat.selectedChannelId) ?? null
  const events = channel ? (chat.eventsByChannel[channel.id] ?? []) : []
  const label = channel ? userChatChannelLabel(channel, chat) : ''
  const channelId = channel?.id ?? null

  useEffect(() => {
    if (!channelId) {
      return
    }
    void loadUserChatHistory(channelId)
    const interval = window.setInterval(
      () => void loadUserChatHistory(channelId),
      CHAT_REFRESH_INTERVAL_MS
    )
    return () => window.clearInterval(interval)
  }, [channelId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [events.length, channelId])

  const rows = events.map((event) => ({
    event,
    author: chat.profiles[event.pubkey]?.displayName ?? event.pubkey.slice(0, 10),
    mine: event.pubkey === chat.pubkey
  }))

  if (!channel) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background text-sm text-muted-foreground">
        Select a channel or direct message from the sidebar.
      </div>
    )
  }

  const submit = async (): Promise<void> => {
    const content = draft.trim()
    if (!content) {
      return
    }
    if (await sendUserChatMessage(channel.id, content)) {
      setDraft('')
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        {channel.type === 'channel' ? (
          <Hash className="size-4 text-muted-foreground" />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
            {label.slice(0, 1).toUpperCase()}
          </span>
        )}
        <h1 className="truncate text-sm font-semibold">{label}</h1>
      </header>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {rows.map(({ event, author, mine }) => (
            <article key={event.id} className="flex gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {author.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold">{mine ? 'You' : author}</span>
                  <time className="text-[11px] text-muted-foreground">
                    {new Date(event.created_at * 1000).toLocaleString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </time>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-6">
                  {event.content}
                </p>
              </div>
            </article>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-lg border border-input bg-input px-3 py-2 focus-within:ring-[3px] focus-within:ring-ring/30">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
            rows={1}
            placeholder={`Message ${channel.type === 'channel' ? `#${label}` : label}`}
            className="max-h-32 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            disabled={chat.sending}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Send message"
            disabled={chat.sending || !draft.trim()}
            onClick={() => void submit()}
          >
            <Send className="size-4" />
          </Button>
        </div>
        {chat.error ? (
          <div className="mx-auto mt-1 max-w-3xl text-xs text-destructive">{chat.error}</div>
        ) : null}
      </div>
    </section>
  )
}

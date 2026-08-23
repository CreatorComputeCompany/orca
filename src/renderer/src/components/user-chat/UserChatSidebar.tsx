import { useEffect } from 'react'
import { Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import {
  ensureUserChatBootstrap,
  selectUserChatChannel,
  useUserChatState,
  userChatChannelLabel
} from './user-chat-store'

function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="px-4 pb-1 pt-2 text-xs font-semibold text-muted-foreground/80 select-none">
      {children}
    </div>
  )
}

export function UserChatSidebar(): React.JSX.Element | null {
  const supported = Boolean(window.api.userChat)
  const chat = useUserChatState()
  const activeView = useAppStore((current) => current.activeView)
  const setActiveView = useAppStore((current) => current.setActiveView)
  useEffect(() => {
    if (supported) {
      void ensureUserChatBootstrap()
    }
  }, [supported])

  // Human chat is a controller capability. Keep the desktop application and
  // standalone clients unchanged when that capability is not present.
  if (!supported) {
    return null
  }

  const open = (channelId: string): void => {
    selectUserChatChannel(channelId)
    setActiveView('user-chat')
  }
  const channels = chat.channels.filter((channel) => channel.type === 'channel')
  const directMessages = chat.channels.filter((channel) => channel.type === 'dm')

  if (chat.status === 'error' && chat.channels.length === 0) {
    return (
      <button
        type="button"
        className="mx-2 mt-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-worktree-sidebar-foreground/8"
        onClick={() => void ensureUserChatBootstrap(true)}
      >
        Chat unavailable · Retry
      </button>
    )
  }

  return (
    <div className="max-h-[36vh] shrink-0 overflow-y-auto worktree-sidebar-scrollbar">
      <SectionTitle>Channels</SectionTitle>
      {channels.map((channel) => {
        const active = activeView === 'user-chat' && chat.selectedChannelId === channel.id
        return (
          <button
            type="button"
            key={channel.id}
            data-current={active ? 'true' : undefined}
            className={cn(
              'mx-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors',
              active
                ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
                : 'text-worktree-sidebar-foreground/65 hover:bg-worktree-sidebar-foreground/8'
            )}
            onClick={() => open(channel.id)}
          >
            <Hash className="size-3.5 shrink-0 text-worktree-sidebar-foreground/35" />
            <span className="truncate">{userChatChannelLabel(channel, chat)}</span>
          </button>
        )
      })}
      <SectionTitle>Direct messages</SectionTitle>
      {directMessages.map((channel) => {
        const label = userChatChannelLabel(channel, chat)
        const active = activeView === 'user-chat' && chat.selectedChannelId === channel.id
        return (
          <button
            type="button"
            key={channel.id}
            data-current={active ? 'true' : undefined}
            className={cn(
              'mx-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors',
              active
                ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
                : 'text-worktree-sidebar-foreground/65 hover:bg-worktree-sidebar-foreground/8'
            )}
            onClick={() => open(channel.id)}
          >
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-worktree-sidebar-foreground/10 text-[9px] font-semibold">
              {label.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">{label}</span>
          </button>
        )
      })}
      {chat.status === 'loading' ? (
        <div className="px-4 py-2 text-xs text-muted-foreground">Loading conversations…</div>
      ) : null}
    </div>
  )
}

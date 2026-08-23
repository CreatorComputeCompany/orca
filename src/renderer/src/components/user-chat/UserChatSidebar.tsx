import { useEffect } from 'react'
import { Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import {
  ensureUserChatBootstrap,
  openUserChatDm,
  selectUserChatChannel,
  useUserChatState,
  userChatChannelLabel
} from './user-chat-store'
import { UserChatNewDmPopover } from './UserChatNewDmPopover'
import { SidebarCollapseReveal, SidebarSectionTrigger } from '../sidebar/SidebarSectionDisclosure'

type UserChatSidebarProps = {
  channelsOpen: boolean
  directMessagesOpen: boolean
  onChannelsOpenChange: (open: boolean) => void
  onDirectMessagesOpenChange: (open: boolean) => void
}

export function UserChatSidebar({
  channelsOpen,
  directMessagesOpen,
  onChannelsOpenChange,
  onDirectMessagesOpenChange
}: UserChatSidebarProps): React.JSX.Element | null {
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
  const openDm = async (pubkey: string): Promise<boolean> => {
    const channel = await openUserChatDm(pubkey)
    if (!channel) {
      return false
    }
    onDirectMessagesOpenChange(true)
    setActiveView('user-chat')
    return true
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
    <div className="flex max-h-[36vh] min-h-0 shrink-0 flex-col overflow-hidden">
      <SidebarSectionTrigger
        label="Channels"
        open={channelsOpen}
        onOpenChange={onChannelsOpenChange}
        controls="sidebar-channels-section"
        className="mx-2 mt-1 w-[calc(100%-1rem)] px-2"
        titleDataValue="channels"
      />
      <SidebarCollapseReveal
        id="sidebar-channels-section"
        open={channelsOpen}
        className={channelsOpen && channels.length > 0 ? 'flex-1' : 'shrink-0'}
      >
        <div className="worktree-sidebar-scrollbar min-h-0 flex-1 overflow-y-auto">
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
        </div>
      </SidebarCollapseReveal>
      <div className="mx-2 mt-1 flex items-center gap-1">
        <SidebarSectionTrigger
          label="Direct messages"
          open={directMessagesOpen}
          onOpenChange={onDirectMessagesOpenChange}
          controls="sidebar-direct-messages-section"
          className="flex-1 px-2"
          titleDataValue="direct-messages"
        />
        <UserChatNewDmPopover
          members={chat.members}
          currentPubkey={chat.pubkey}
          pending={chat.openingDm}
          onSelect={openDm}
        />
      </div>
      <SidebarCollapseReveal
        id="sidebar-direct-messages-section"
        open={directMessagesOpen}
        className={directMessagesOpen && directMessages.length > 0 ? 'flex-1' : 'shrink-0'}
      >
        <div className="worktree-sidebar-scrollbar min-h-0 flex-1 overflow-y-auto">
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
        </div>
      </SidebarCollapseReveal>
      {chat.status === 'loading' ? (
        <div className="px-4 py-2 text-xs text-muted-foreground">Loading conversations…</div>
      ) : null}
    </div>
  )
}

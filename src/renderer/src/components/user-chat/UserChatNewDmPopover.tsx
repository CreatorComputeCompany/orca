import { useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { UserChatMember } from '../../../../shared/user-chat-contract'

export function filterUserChatDmMembers(
  members: UserChatMember[],
  currentPubkey: string | null,
  query: string
): UserChatMember[] {
  const normalizedQuery = query.trim().toLowerCase()
  return members
    .filter((member) => member.pubkey !== currentPubkey)
    .filter(
      (member) =>
        !normalizedQuery ||
        member.displayName.toLowerCase().includes(normalizedQuery) ||
        member.pubkey.includes(normalizedQuery)
    )
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

type UserChatNewDmPopoverProps = {
  members: UserChatMember[]
  currentPubkey: string | null
  pending: boolean
  onSelect: (pubkey: string) => Promise<boolean>
}

export function UserChatNewDmPopover({
  members,
  currentPubkey,
  pending,
  onSelect
}: UserChatNewDmPopoverProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const candidates = useMemo(
    () => filterUserChatDmMembers(members, currentPubkey, query),
    [currentPubkey, members, query]
  )

  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setQuery('')
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-muted-foreground"
          aria-label="New direct message"
          disabled={pending}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-72 overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <div className="border-b border-border px-3 py-2.5">
          <div className="text-sm font-semibold">New message</div>
          <div className="mt-2 flex items-center gap-2 rounded-md border border-input bg-input px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people"
              className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="popover-scroll-content scrollbar-sleek max-h-72 overflow-y-auto p-1.5">
          {candidates.map((member) => (
            <button
              key={member.pubkey}
              type="button"
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              disabled={pending}
              onClick={() => {
                void onSelect(member.pubkey).then((selected) => {
                  if (selected) {
                    handleOpenChange(false)
                  }
                })
              }}
            >
              {member.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt=""
                  className="size-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                  {member.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{member.displayName}</span>
            </button>
          ))}
          {candidates.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {query.trim() ? 'No people found.' : 'No other members yet.'}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

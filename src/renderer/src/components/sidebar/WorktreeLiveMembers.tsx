import React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { resolveLiveMembersForWorktree } from '@/lib/worktree-live-members'
import { useAppStore } from '@/store'
import type { Worktree } from '../../../../shared/worktree/types'

const AVATAR_COLORS = [
  'bg-rose-400 text-rose-950',
  'bg-amber-300 text-amber-950',
  'bg-emerald-400 text-emerald-950',
  'bg-sky-400 text-sky-950',
  'bg-violet-400 text-violet-950'
]

export function WorktreeLiveMembers({
  worktree
}: {
  worktree: Worktree
}): React.JSX.Element | null {
  const environmentMembers = useAppStore(
    (state) =>
      state.runtimeEnvironments?.find(
        (environment) => environment.id === worktree.runtimeOwnerEnvironmentId
      )?.workspaceLiveMembers
  )
  const members = resolveLiveMembersForWorktree(
    environmentMembers,
    worktree.liveMembers,
    worktree.id
  )
  if (members.length === 0) {
    return null
  }
  const visible = members.slice(0, 3)
  const names = members.map((member) => member.displayName).join(', ')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="ml-auto inline-flex shrink-0 items-center pl-1"
          aria-label={`${names} live in this workspace`}
          data-worktree-live-members=""
        >
          {visible.map((member, index) => (
            <span
              key={member.key}
              className={`relative inline-flex size-5 items-center justify-center rounded-full border-2 border-background text-[9px] font-bold uppercase shadow-sm ${index > 0 ? '-ml-1.5' : ''} ${avatarColor(member.key)}`}
            >
              {member.displayName.slice(0, 1)}
              <span className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full border border-background bg-emerald-400" />
            </span>
          ))}
          {members.length > visible.length ? (
            <span className="-ml-1.5 inline-flex size-5 items-center justify-center rounded-full border-2 border-background bg-muted text-[8px] font-semibold text-muted-foreground">
              +{members.length - visible.length}
            </span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {members.length === 1 ? `${names} is live here` : `${names} are live here`}
      </TooltipContent>
    </Tooltip>
  )
}

function avatarColor(key: string): string {
  let hash = 0
  for (const character of key) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!
}

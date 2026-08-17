import React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { resolveLiveMembersForWorktree } from '@/lib/worktree-live-members'
import { followLiveMemberTarget } from '@/lib/worktree-live-member-navigation'
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
  const environment = useAppStore((state) =>
    state.runtimeEnvironments?.find(
      (environment) => environment.id === worktree.runtimeOwnerEnvironmentId
    )
  )
  const members = resolveLiveMembersForWorktree(
    environment?.workspaceLiveMembers,
    worktree.liveMembers,
    worktree.id,
    environment?.workspaceViewerMemberKey
  )
  if (members.length === 0) {
    return null
  }
  const visible = members.slice(0, 3)
  const names = members.map((member) => member.displayName).join(', ')
  return (
    <span
      className="ml-auto inline-flex shrink-0 items-center pl-1"
      aria-label={`${names} live in this workspace`}
      data-worktree-live-members=""
    >
      {visible.map((member, index) => (
        <Tooltip key={member.key}>
          <TooltipTrigger asChild>
            <span
              role="button"
              tabIndex={0}
              className={`relative inline-flex size-5 cursor-pointer items-center justify-center rounded-full border-2 border-background text-[9px] font-bold uppercase shadow-sm ${index > 0 ? '-ml-1.5' : ''} ${avatarColor(member.key)}`}
              aria-label={`Follow ${member.displayName}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                void followLiveMemberTarget(worktree, member)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                  return
                }
                event.preventDefault()
                event.stopPropagation()
                void followLiveMemberTarget(worktree, member)
              }}
            >
              {member.displayName.slice(0, 1)}
              <span className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full border border-background bg-emerald-400" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {member.activeTabTitle
              ? `${member.displayName} · ${member.activeTabTitle} · click to follow`
              : `${member.displayName} · click to follow`}
          </TooltipContent>
        </Tooltip>
      ))}
      {members.length > visible.length ? (
        <span className="-ml-1.5 inline-flex size-5 items-center justify-center rounded-full border-2 border-background bg-muted text-[8px] font-semibold text-muted-foreground">
          +{members.length - visible.length}
        </span>
      ) : null}
    </span>
  )
}

function avatarColor(key: string): string {
  let hash = 0
  for (const character of key) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!
}

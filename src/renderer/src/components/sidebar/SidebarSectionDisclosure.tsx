import type { KeyboardEvent, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type SidebarSectionTriggerProps = {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  controls: string
  className?: string
  labelClassName?: string
  titleDataValue?: string
}

export function SidebarSectionTrigger({
  label,
  open,
  onOpenChange,
  controls,
  className,
  labelClassName,
  titleDataValue
}: SidebarSectionTriggerProps): React.JSX.Element {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowRight' && !open) {
      event.preventDefault()
      onOpenChange(true)
    } else if (event.key === 'ArrowLeft' && open) {
      event.preventDefault()
      onOpenChange(false)
    }
  }

  return (
    <button
      type="button"
      className={cn(
        'group/section-header flex h-7 min-w-0 items-center justify-start gap-0.5 rounded-md text-left text-xs font-semibold text-muted-foreground/80 outline-none transition-colors hover:bg-worktree-sidebar-foreground/8 focus-visible:ring-1 focus-visible:ring-ring',
        className
      )}
      aria-expanded={open}
      aria-controls={controls}
      onClick={() => onOpenChange(!open)}
      onKeyDown={handleKeyDown}
    >
      <span
        className={cn('truncate select-none', labelClassName)}
        data-sidebar-section-title={titleDataValue}
      >
        {label}
      </span>
      <ChevronDown
        className={cn(
          'invisible size-3 shrink-0 transition-transform duration-150 group-hover/section-header:visible group-focus-visible/section-header:visible',
          !open && '-rotate-90'
        )}
      />
    </button>
  )
}

type SidebarCollapseRevealProps = {
  id: string
  open: boolean
  children: ReactNode
  className?: string
}

export function SidebarCollapseReveal({
  id,
  open,
  children,
  className
}: SidebarCollapseRevealProps): React.JSX.Element {
  return (
    <div
      id={id}
      className={cn(
        'grid min-h-0 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        className
      )}
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <div className="flex min-h-0 flex-col overflow-hidden">
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
            open ? 'translate-y-0' : '-translate-y-1'
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

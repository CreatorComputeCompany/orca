import { Button } from '@/components/ui/button'

type GsdLaunchOverlayProps = {
  state: 'installing' | 'link-required' | 'linking' | 'failed'
  memberName: string
  error: string | null
  onLink: () => void
  onRetry: () => void
}

export default function GsdLaunchOverlay({
  state,
  memberName,
  error,
  onLink,
  onRetry
}: GsdLaunchOverlayProps): React.JSX.Element {
  if (state === 'installing') {
    return (
      <div className="pointer-events-none fixed inset-0 z-[100] bg-background/55 backdrop-blur-[2px]" />
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 p-6 text-foreground backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        {state === 'failed' ? (
          <>
            <h1 className="font-semibold">Could not finish GSD launch</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button className="mt-5 w-full" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <h1 className="font-semibold">Link {memberName} to GSD</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This one-time link lets GSD open card worktrees as your existing Orca user. It does
              not create a new Orca user or change workspace ownership.
            </p>
            <Button className="mt-5 w-full" disabled={state === 'linking'} onClick={onLink}>
              {state === 'linking' ? 'Opening GSD…' : 'Link GSD and continue'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

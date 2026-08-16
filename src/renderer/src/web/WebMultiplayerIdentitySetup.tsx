import { useState } from 'react'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { enrollWebMultiplayerIdentity } from './web-multiplayer-enrollment'

type Props = { onEnrolled: () => void }

export default function WebMultiplayerIdentitySetup({ onEnrolled }: Props): React.JSX.Element {
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const enroll = async (): Promise<void> => {
    if (!displayName.trim()) {
      setError('Enter your name.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await enrollWebMultiplayerIdentity(displayName.trim())
      onEnrolled()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-6 text-foreground">
      <div className="flex w-full max-w-[440px] flex-col gap-5 rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
            <Users size={18} aria-hidden />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-6">Who are you?</h1>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Use the same name on your other devices to see your private worktrees.
            </p>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="multiplayer-name">Your name</Label>
          <Input
            id="multiplayer-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void enroll()
              }
            }}
            autoFocus
            autoComplete="name"
            placeholder="Jake"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button onClick={() => void enroll()} disabled={submitting || !displayName.trim()}>
          {submitting ? 'Setting up…' : 'Continue'}
        </Button>
        <p className="text-xs leading-4 text-muted-foreground">
          Internal spike: names are trusted. Email and password can replace this step later.
        </p>
      </div>
    </div>
  )
}

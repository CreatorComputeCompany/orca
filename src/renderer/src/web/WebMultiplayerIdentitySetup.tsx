import { useState } from 'react'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { registerWebMultiplayerAccount } from './web-multiplayer-enrollment'
import { readStoredWebRuntimeEnvironment } from './web-runtime-environment'

type Props = { onEnrolled: () => void; onSignIn: () => void }

export default function WebMultiplayerIdentitySetup({
  onEnrolled,
  onSignIn
}: Props): React.JSX.Element {
  const existing = readStoredWebRuntimeEnvironment()
  const [displayName, setDisplayName] = useState(existing?.multiplayerDisplayName ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const enroll = async (): Promise<void> => {
    if (!displayName.trim()) {
      setError('Enter your name.')
      return
    }
    if (!email.trim()) {
      setError('Enter your email address.')
      return
    }
    if (password.length < 12) {
      setError('Use a password with at least 12 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await registerWebMultiplayerAccount({
        displayName: displayName.trim(),
        email: email.trim(),
        password
      })
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
            <h1 className="text-base font-semibold leading-6">Create your Orca account</h1>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              This account keeps your private workspaces tied to you across browsers.
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
            disabled={Boolean(existing?.multiplayerDisplayName)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="multiplayer-email">Email</Label>
          <Input
            id="multiplayer-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="multiplayer-password">Password</Label>
          <Input
            id="multiplayer-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="multiplayer-password-confirm">Confirm password</Label>
          <Input
            id="multiplayer-password-confirm"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void enroll()
              }
            }}
            autoComplete="new-password"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          onClick={() => void enroll()}
          disabled={submitting || !displayName.trim() || !email.trim() || password.length < 12}
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
        <Button variant="ghost" onClick={onSignIn} disabled={submitting}>
          Already have an account? Sign in
        </Button>
        <p className="text-xs leading-4 text-muted-foreground">
          Your password is stored as a salted hash and is never recoverable from the controller.
        </p>
      </div>
    </div>
  )
}

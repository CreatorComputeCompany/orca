import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  loginWebMultiplayerAccount,
  linkCurrentOrcaMemberToGsd,
  startGsdSharedLogin
} from './web-multiplayer-enrollment'

type Props = {
  onAuthenticated: () => void
  onUseAccessLink: () => void
  secondaryActionLabel?: string
}

export default function WebMultiplayerLogin({
  onAuthenticated,
  onUseAccessLink,
  secondaryActionLabel = 'Use an enrollment link instead'
}: Props): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const login = async (): Promise<void> => {
    setSubmitting(true)
    setError(null)
    try {
      await loginWebMultiplayerAccount({ email: email.trim(), password })
      try {
        await linkCurrentOrcaMemberToGsd()
      } catch {
        onAuthenticated()
      }
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
            <LogIn size={18} aria-hidden />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-6">Sign in to Orca</h1>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Access your private and shared workspaces from this browser.
            </p>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoFocus
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void login()
              }
            }}
            autoComplete="current-password"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button onClick={() => void login()} disabled={submitting || !email.trim() || !password}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>or</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button variant="outline" onClick={startGsdSharedLogin}>
          Continue with GSD
        </Button>
        <Button variant="ghost" onClick={onUseAccessLink}>
          {secondaryActionLabel}
        </Button>
      </div>
    </div>
  )
}

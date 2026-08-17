import '../assets/main.css'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import ReactDOM from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import WebConnect from './WebConnect'
import WebMultiplayerIdentitySetup from './WebMultiplayerIdentitySetup'
import WebMultiplayerLogin from './WebMultiplayerLogin'
import {
  clearWebMultiplayerSsoResult,
  installWebMultiplayerAuth,
  linkCurrentOrcaMemberToGsd,
  readWebMultiplayerSsoResult
} from './web-multiplayer-enrollment'
import { RecoverableRenderErrorBoundary } from '../components/error-boundaries/RecoverableRenderErrorBoundary'
import {
  clearPairingInputFromAddressBar,
  decideWebPairingStartup,
  readPairingInputFromLocation
} from './web-pairing'
import {
  createStoredWebRuntimeEnvironment,
  readStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment
} from './web-runtime-environment'
import { installWebPreloadApi } from './web-preload-api'
import { I18nProvider } from '../i18n/I18nProvider'
import { translate } from '../i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import {
  buildGsdLaunchPrompt,
  captureGsdLaunchFromLocation,
  consumePendingGsdLaunch,
  isGsdIdentityLinkRequired,
  resolveGsdControllerRepoId,
  shouldConsumePendingGsdLaunch
} from './gsd-orca-launch'
const App = lazy(() => import('../App'))

function WebRoot(): React.JSX.Element {
  const initialSsoResult = useMemo(() => readWebMultiplayerSsoResult(window.location), [])
  const hasPendingGsdLaunch = useMemo(() => captureGsdLaunchFromLocation(window.location), [])
  const initialPairingInput = useMemo(() => readPairingInputFromLocation(window.location), [])
  // Why: current runtime links carry scope metadata. Runtime-scope offers keep
  // the instant save path; mobile/legacy-unknown offers must be shown/probed.
  const startupDecision = useMemo(() => {
    const decision = decideWebPairingStartup({
      initialPairingInput,
      hasStoredEnvironment: readStoredWebRuntimeEnvironment() !== null
    })
    if (
      decision.kind === 'auto-save-runtime-offer' ||
      (decision.kind === 'show-connect' && decision.initialPairingInput !== null)
    ) {
      clearPairingInputFromAddressBar()
    }
    return decision
  }, [initialPairingInput])
  const [ssoState, setSsoState] = useState<
    'idle' | 'installing' | 'installed' | 'link-required' | 'linking' | 'failed'
  >(() => (initialSsoResult ? 'installing' : 'idle'))
  const [ssoError, setSsoError] = useState<string | null>(null)
  const [hasEnvironment, setHasEnvironment] = useState(() => {
    if (startupDecision.kind === 'auto-save-runtime-offer') {
      saveStoredWebRuntimeEnvironment(
        createStoredWebRuntimeEnvironment({
          name: 'Orca Server',
          offer: startupDecision.offer,
          previousEnvironment: readStoredWebRuntimeEnvironment()
        })
      )
      return true
    }
    return startupDecision.kind === 'use-stored-environment'
  })
  const [hasMultiplayerAccount, setHasMultiplayerAccount] = useState(() =>
    Boolean(readStoredWebRuntimeEnvironment()?.multiplayerAuthEmail)
  )
  const [showAccessLink, setShowAccessLink] = useState(false)
  const [showAccountLogin, setShowAccountLogin] = useState(false)
  const appHydrated = useAppStore((state) => state.hydrationSucceeded)
  const gsdLaunchStarted = useRef(false)

  useEffect(() => {
    if (!initialSsoResult) {
      return
    }
    clearWebMultiplayerSsoResult()
    void installWebMultiplayerAuth(initialSsoResult, readStoredWebRuntimeEnvironment())
      .then(() => {
        setHasEnvironment(true)
        setHasMultiplayerAccount(true)
        setSsoState('installed')
      })
      .catch((error) => {
        setSsoError(error instanceof Error ? error.message : String(error))
        setSsoState('failed')
      })
  }, [initialSsoResult])

  useEffect(() => {
    if (
      !shouldConsumePendingGsdLaunch({
        hasMultiplayerAccount,
        hasPendingLaunch: hasPendingGsdLaunch,
        appHydrated,
        alreadyStarted: gsdLaunchStarted.current
      })
    ) {
      return
    }
    gsdLaunchStarted.current = true
    void consumePendingGsdLaunch()
      .then((launch) => {
        if (!launch) {
          return
        }
        const state = useAppStore.getState()
        const controllerEnvironment = readStoredWebRuntimeEnvironment()
        const controllerRepoId = controllerEnvironment
          ? resolveGsdControllerRepoId({
              repos: state.repos,
              controllerEnvironmentId: controllerEnvironment.id,
              repositoryRemoteUrl: launch.repository.remoteUrl
            })
          : null
        if (!controllerRepoId) {
          throw new Error('Orca could not find this project on the workspace controller.')
        }
        state.openModal('new-workspace-composer', {
          prefilledName: launch.title,
          initialRepoId: controllerRepoId,
          initialEphemeralVmRecipeId: 'boxd-fork',
          initialAgent: launch.agent,
          autoCreate: true,
          prefilledPrompt: buildGsdLaunchPrompt(launch),
          telemetrySource: 'unknown'
        })
      })
      .catch((error) => {
        if (isGsdIdentityLinkRequired(error)) {
          setSsoState('link-required')
          return
        }
        setSsoError(error instanceof Error ? error.message : String(error))
        setSsoState('failed')
      })
  }, [appHydrated, hasMultiplayerAccount, hasPendingGsdLaunch])

  if (ssoState === 'installing') {
    return <div className="min-h-dvh bg-background" />
  }
  if (ssoState === 'link-required' || ssoState === 'linking') {
    const current = readStoredWebRuntimeEnvironment()
    const memberName = current?.multiplayerDisplayName ?? 'this Orca user'
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-sm">
          <h1 className="font-semibold">Link {memberName} to GSD</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This one-time link lets GSD open card worktrees as your existing Orca user. It does not
            create a new Orca user or change workspace ownership.
          </p>
          <Button
            className="mt-5 w-full"
            disabled={ssoState === 'linking'}
            onClick={() => {
              setSsoState('linking')
              void linkCurrentOrcaMemberToGsd().catch((error) => {
                setSsoError(error instanceof Error ? error.message : String(error))
                setSsoState('failed')
              })
            }}
          >
            {ssoState === 'linking' ? 'Opening GSD…' : 'Link GSD and continue'}
          </Button>
        </div>
      </div>
    )
  }
  if (ssoState === 'failed') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
        <div className="max-w-md rounded-lg border border-border bg-card p-5">
          <h1 className="font-semibold">Could not finish GSD sign-in</h1>
          <p className="mt-2 text-sm text-muted-foreground">{ssoError}</p>
          <button className="mt-4 underline" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (showAccountLogin) {
    return (
      <WebMultiplayerLogin
        onAuthenticated={() => {
          setHasEnvironment(true)
          setHasMultiplayerAccount(true)
          setShowAccountLogin(false)
        }}
        onUseAccessLink={() => setShowAccountLogin(false)}
        secondaryActionLabel="Back to account setup"
      />
    )
  }

  if (!hasEnvironment) {
    if (!showAccessLink && startupDecision.kind === 'show-connect' && !initialPairingInput) {
      return (
        <WebMultiplayerLogin
          onAuthenticated={() => {
            setHasEnvironment(true)
            setHasMultiplayerAccount(true)
          }}
          onUseAccessLink={() => setShowAccessLink(true)}
        />
      )
    }
    return (
      <WebConnect
        initialPairingInput={
          startupDecision.kind === 'show-connect' ? startupDecision.initialPairingInput : null
        }
        onConnected={() => setHasEnvironment(true)}
      />
    )
  }

  if (!hasMultiplayerAccount) {
    return (
      <WebMultiplayerIdentitySetup
        onEnrolled={() => setHasMultiplayerAccount(true)}
        onSignIn={() => setShowAccountLogin(true)}
      />
    )
  }

  installWebPreloadApi()
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <App />
    </Suspense>
  )
}

function WebRootBoundary(): React.JSX.Element {
  useTranslation()
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="web.root"
      surface="web-root"
      title={translate('app.recoverableError.webTitle', 'Orca web hit a renderer error.')}
      description={translate(
        'app.recoverableError.webDescription',
        'Retry the web client or reconnect to the paired runtime.'
      )}
    >
      <WebRoot />
    </RecoverableRenderErrorBoundary>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <I18nProvider>
    <WebRootBoundary />
  </I18nProvider>
)

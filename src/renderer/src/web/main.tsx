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
import {
  buildGsdLaunchPrompt,
  captureGsdLaunchFromLocation,
  clearPendingGsdLaunch,
  consumePendingGsdLaunch,
  isGsdIdentityLinkRequired,
  isGsdLaunchExpired,
  linkPendingGsdLaunch,
  pendingGsdLaunchToken,
  retryGsdIdentityLink,
  resolveGsdControllerRepoId,
  shouldConsumePendingGsdLaunch
} from './gsd-orca-launch'
import GsdLaunchOverlay from './GsdLaunchOverlay'
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
    void retryGsdIdentityLink(consumePendingGsdLaunch)
      .then(async (launch) => {
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
        const externalLaunchId = `gsd:${launch.cardPublicId}`
        const existingRuntime = (await window.api.ephemeralVm.listRuntimes()).find(
          (runtime) =>
            runtime.externalLaunchId === externalLaunchId &&
            runtime.workspaceId &&
            runtime.runtimeEnvironmentId
        )
        if (existingRuntime?.workspaceId && existingRuntime.runtimeEnvironmentId) {
          const token = pendingGsdLaunchToken()!
          await linkPendingGsdLaunch(
            {
              id: existingRuntime.workspaceId,
              runtimeOwnerEnvironmentId: existingRuntime.runtimeEnvironmentId
            },
            token
          )
          state.setActiveView('terminal')
          state.setActiveWorktree(existingRuntime.workspaceId)
          state.setSidebarOpen(true)
          return
        }
        state.openModal('new-workspace-composer', {
          prefilledName: launch.title,
          initialRepoId: controllerRepoId,
          initialEphemeralVmRecipeId: 'boxd-fork',
          initialAgent: launch.agent,
          autoCreate: true,
          prefilledPrompt: buildGsdLaunchPrompt(launch),
          gsdLaunch: {
            token: pendingGsdLaunchToken()!,
            runPublicId: launch.runPublicId,
            cardPublicId: launch.cardPublicId,
            attachments: launch.attachments
          },
          telemetrySource: 'unknown'
        })
      })
      .catch((error) => {
        if (isGsdLaunchExpired(error)) {
          clearPendingGsdLaunch()
          setSsoError(null)
          setSsoState('idle')
          return
        }
        if (isGsdIdentityLinkRequired(error)) {
          setSsoState('link-required')
          return
        }
        setSsoError(error instanceof Error ? error.message : String(error))
        setSsoState('failed')
      })
  }, [appHydrated, hasMultiplayerAccount, hasPendingGsdLaunch])

  if (ssoState === 'installing' && (!hasEnvironment || !hasMultiplayerAccount)) {
    return <div className="min-h-dvh bg-background" />
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
  const showGsdOverlay =
    ssoState === 'installing' ||
    ssoState === 'link-required' ||
    ssoState === 'linking' ||
    ssoState === 'failed'
  const memberName = readStoredWebRuntimeEnvironment()?.multiplayerDisplayName ?? 'this Orca user'
  return (
    <>
      <Suspense fallback={<div className="min-h-dvh bg-background" />}>
        <App />
      </Suspense>
      {showGsdOverlay ? (
        <GsdLaunchOverlay
          state={ssoState}
          memberName={memberName}
          error={ssoError}
          onLink={() => {
            setSsoState('linking')
            void linkCurrentOrcaMemberToGsd().catch((error) => {
              setSsoError(error instanceof Error ? error.message : String(error))
              setSsoState('failed')
            })
          }}
          onRetry={() => window.location.reload()}
        />
      ) : null}
    </>
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

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { clearDefaultSessionCookiesMock, errorToastMock, successToastMock, warningToastMock } =
  vi.hoisted(() => ({
    clearDefaultSessionCookiesMock: vi.fn(),
    errorToastMock: vi.fn(),
    successToastMock: vi.fn(),
    warningToastMock: vi.fn()
  }))

vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ clearDefaultSessionCookies: clearDefaultSessionCookiesMock }) }
}))

vi.mock('sonner', () => ({
  toast: { error: errorToastMock, success: successToastMock, warning: warningToastMock }
}))

import type { BrowserCookieImportSummary } from '../../../shared/browser-workspace-types'
import { emitBrowserCookieImportToast } from './browser-cookie-import-toast'

const summary: BrowserCookieImportSummary = {
  totalCookies: 3,
  importedCookies: 3,
  skippedCookies: 0,
  domains: ['example.com']
}

const localTarget = {
  profileId: 'default',
  executionHostId: 'local' as const,
  executionHostLabel: 'Local Mac'
}

const remoteTarget = {
  profileId: 'default',
  executionHostId: 'runtime:remote-mac' as const,
  executionHostLabel: 'Remote Mac'
}

describe('emitBrowserCookieImportToast', () => {
  beforeEach(() => {
    clearDefaultSessionCookiesMock.mockReset().mockResolvedValue(true)
    errorToastMock.mockReset()
    successToastMock.mockReset()
    warningToastMock.mockReset()
  })

  it('shows the localized total-failure warning', () => {
    emitBrowserCookieImportToast(
      {
        ...summary,
        warning: {
          code: 'restart-fallback-unavailable',
          loadedCookies: 0,
          failedCookies: 3
        }
      },
      'Imported 3 cookies.',
      localTarget
    )

    expect(warningToastMock).toHaveBeenCalledWith(
      'None of the 3 cookies could be loaded, and the restart fallback was unavailable. The previous cookies for this profile were replaced. Try the import again.'
    )
    expect(successToastMock).not.toHaveBeenCalled()
  })

  it('shows success when the import has no warning', () => {
    emitBrowserCookieImportToast(summary, 'Imported 3 cookies.', localTarget)

    expect(successToastMock).toHaveBeenCalledWith('Imported 3 cookies.')
    expect(warningToastMock).not.toHaveBeenCalled()
  })

  it('shows separate host-specific Google guidance after success', () => {
    emitBrowserCookieImportToast(
      { ...summary, importedCookies: 2, skippedCookies: 1, googleCookiesSkipped: 1 },
      'Imported 2 cookies.',
      remoteTarget
    )

    expect(successToastMock).toHaveBeenCalledWith('Imported 2 cookies.')
    expect(warningToastMock).toHaveBeenCalledWith(
      'Google cookies were not imported. Open a browser in Orca on Remote Mac with this profile, then sign into Google.',
      {
        duration: 12000,
        action: { label: 'Clear profile cookies', onClick: expect.any(Function) }
      }
    )
    expect(successToastMock.mock.invocationCallOrder[0]).toBeLessThan(
      warningToastMock.mock.invocationCallOrder[0]
    )
  })

  it('does not infer a Google warning from generic skipped cookies', () => {
    emitBrowserCookieImportToast(
      { ...summary, importedCookies: 2, skippedCookies: 1 },
      'Imported 2 cookies.',
      localTarget
    )

    expect(successToastMock).toHaveBeenCalledWith('Imported 2 cookies.')
    expect(warningToastMock).not.toHaveBeenCalled()
  })

  it('keeps both applicable warnings when restart fallback is unavailable', () => {
    emitBrowserCookieImportToast(
      {
        ...summary,
        importedCookies: 1,
        skippedCookies: 2,
        googleCookiesSkipped: 1,
        warning: {
          code: 'restart-fallback-unavailable',
          loadedCookies: 1,
          failedCookies: 1
        }
      },
      'Imported 1 cookie.',
      remoteTarget
    )

    expect(successToastMock).not.toHaveBeenCalled()
    expect(warningToastMock.mock.calls).toEqual([
      [
        'Imported 1 of 2 cookies. The rest could not be loaded, and the restart fallback was unavailable. Try the import again.'
      ],
      [
        'Google cookies were not imported. Open a browser in Orca on Remote Mac with this profile, then sign into Google.',
        {
          duration: 12000,
          action: { label: 'Clear profile cookies', onClick: expect.any(Function) }
        }
      ]
    ])
  })

  it('clears the default profile on the import execution host', async () => {
    emitBrowserCookieImportToast(
      { ...summary, googleCookiesSkipped: 1 },
      'Imported 3 cookies.',
      remoteTarget
    )

    warningToastMock.mock.calls[0]?.[1].action.onClick()

    await vi.waitFor(() =>
      expect(clearDefaultSessionCookiesMock).toHaveBeenCalledWith('runtime:remote-mac')
    )
    expect(successToastMock).toHaveBeenLastCalledWith('Profile cookies cleared.')
    expect(errorToastMock).not.toHaveBeenCalled()
  })

  it('does not offer the default-profile clear action for an isolated profile', () => {
    emitBrowserCookieImportToast({ ...summary, googleCookiesSkipped: 1 }, 'Imported 3 cookies.', {
      ...remoteTarget,
      profileId: 'isolated-profile'
    })

    expect(warningToastMock).toHaveBeenLastCalledWith(expect.any(String), { duration: 12000 })
  })
})

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { defaultOrcaPortalContainer, getOrcaWebEmbedPortalContainer } from './web-embed-portal'

function embedWindow(value: unknown): Window {
  return { __ORCA_WEB_EMBED__: value } as unknown as Window
}

describe('getOrcaWebEmbedPortalContainer', () => {
  it('returns the embed container', () => {
    const container = document.createElement('div')
    expect(getOrcaWebEmbedPortalContainer(embedWindow({ container }))).toBe(container)
  })

  it('rejects missing and invalid containers', () => {
    expect(getOrcaWebEmbedPortalContainer(embedWindow(undefined))).toBeUndefined()
    expect(getOrcaWebEmbedPortalContainer(embedWindow({ container: 'body' }))).toBeUndefined()
  })

  it('reads the active browser bootstrap', () => {
    const container = document.createElement('div')
    ;(window as Window & { __ORCA_WEB_EMBED__?: unknown }).__ORCA_WEB_EMBED__ = { container }
    expect(defaultOrcaPortalContainer()).toBe(container)
    delete (window as Window & { __ORCA_WEB_EMBED__?: unknown }).__ORCA_WEB_EMBED__
  })
})

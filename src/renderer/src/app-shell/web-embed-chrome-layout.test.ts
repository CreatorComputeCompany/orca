import { describe, expect, it } from 'vitest'
import { resolveWebEmbedChromeLayout } from './web-embed-chrome-layout'

const unrestrictedChrome = {
  focusedWebEmbed: false,
  storedSidebarOpen: true,
  storedRightSidebarOpen: true,
  defaultShowSidebar: true,
  workspaceChromeActive: true,
  defaultShowRightSidebarControls: true
}

describe('focused web embed chrome', () => {
  it('suppresses navigation even when persisted preferences request it', () => {
    expect(resolveWebEmbedChromeLayout({ ...unrestrictedChrome, focusedWebEmbed: true })).toEqual({
      sidebarOpen: false,
      rightSidebarOpen: false,
      showSidebar: false,
      workspaceChromeForTitlebar: false,
      showRightSidebarControls: false
    })
  })

  it('preserves normal Orca chrome outside an embed', () => {
    expect(resolveWebEmbedChromeLayout(unrestrictedChrome)).toEqual({
      sidebarOpen: true,
      rightSidebarOpen: true,
      showSidebar: true,
      workspaceChromeForTitlebar: true,
      showRightSidebarControls: true
    })
  })
})

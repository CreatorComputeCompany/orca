export type WebEmbedChromeInput = {
  focusedWebEmbed: boolean
  storedSidebarOpen: boolean
  storedRightSidebarOpen: boolean
  defaultShowSidebar: boolean
  workspaceChromeActive: boolean
  defaultShowRightSidebarControls: boolean
}

export function resolveWebEmbedChromeLayout(input: WebEmbedChromeInput) {
  if (!input.focusedWebEmbed) {
    return {
      sidebarOpen: input.storedSidebarOpen,
      rightSidebarOpen: input.storedRightSidebarOpen,
      showSidebar: input.defaultShowSidebar,
      workspaceChromeForTitlebar: input.workspaceChromeActive,
      showRightSidebarControls: input.defaultShowRightSidebarControls
    }
  }
  return {
    sidebarOpen: false,
    rightSidebarOpen: false,
    showSidebar: false,
    workspaceChromeForTitlebar: false,
    showRightSidebarControls: false
  }
}

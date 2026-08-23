import { useCallback, useState } from 'react'

export type SidebarSection = 'channels' | 'directMessages' | 'workspaces'
export type SidebarSectionVisibility = Record<SidebarSection, boolean>

export const SIDEBAR_SECTION_VISIBILITY_STORAGE_KEY = 'orca.sidebar.sectionVisibility.v1'

export const DEFAULT_SIDEBAR_SECTION_VISIBILITY: SidebarSectionVisibility = {
  channels: true,
  directMessages: true,
  workspaces: true
}

export function parseSidebarSectionVisibility(
  storedValue: string | null
): SidebarSectionVisibility {
  if (storedValue === null) {
    return DEFAULT_SIDEBAR_SECTION_VISIBILITY
  }

  try {
    const parsed = JSON.parse(storedValue) as Partial<Record<SidebarSection, unknown>>
    return {
      channels:
        typeof parsed.channels === 'boolean'
          ? parsed.channels
          : DEFAULT_SIDEBAR_SECTION_VISIBILITY.channels,
      directMessages:
        typeof parsed.directMessages === 'boolean'
          ? parsed.directMessages
          : DEFAULT_SIDEBAR_SECTION_VISIBILITY.directMessages,
      workspaces:
        typeof parsed.workspaces === 'boolean'
          ? parsed.workspaces
          : DEFAULT_SIDEBAR_SECTION_VISIBILITY.workspaces
    }
  } catch {
    return DEFAULT_SIDEBAR_SECTION_VISIBILITY
  }
}

function readSidebarSectionVisibility(): SidebarSectionVisibility {
  try {
    return parseSidebarSectionVisibility(
      window.localStorage.getItem(SIDEBAR_SECTION_VISIBILITY_STORAGE_KEY)
    )
  } catch {
    return DEFAULT_SIDEBAR_SECTION_VISIBILITY
  }
}

export function useSidebarSectionVisibility(): {
  visibility: SidebarSectionVisibility
  setSectionOpen: (section: SidebarSection, open: boolean) => void
} {
  const [visibility, setVisibility] = useState(readSidebarSectionVisibility)

  const setSectionOpen = useCallback((section: SidebarSection, open: boolean) => {
    setVisibility((current) => {
      if (current[section] === open) {
        return current
      }

      const next = { ...current, [section]: open }
      try {
        window.localStorage.setItem(SIDEBAR_SECTION_VISIBILITY_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // The disclosure still works when storage is blocked or full.
      }
      return next
    })
  }, [])

  return { visibility, setSectionOpen }
}

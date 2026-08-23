import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SIDEBAR_SECTION_VISIBILITY,
  parseSidebarSectionVisibility
} from './sidebar-section-visibility'

describe('parseSidebarSectionVisibility', () => {
  it('opens every section by default', () => {
    expect(parseSidebarSectionVisibility(null)).toEqual(DEFAULT_SIDEBAR_SECTION_VISIBILITY)
    expect(parseSidebarSectionVisibility('not json')).toEqual(DEFAULT_SIDEBAR_SECTION_VISIBILITY)
  })

  it('preserves valid saved values and repairs missing fields', () => {
    expect(parseSidebarSectionVisibility('{"channels":false,"workspaces":false}')).toEqual({
      channels: false,
      directMessages: true,
      workspaces: false
    })
  })
})

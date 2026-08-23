// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarCollapseReveal, SidebarSectionTrigger } from './SidebarSectionDisclosure'

describe('SidebarSectionDisclosure', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it('toggles from the full header hit area and exposes disclosure semantics', async () => {
    const onOpenChange = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <SidebarSectionTrigger
          label="Channels"
          open
          onOpenChange={onOpenChange}
          controls="channels-body"
        />
      )
    })

    const trigger = container.querySelector('button')
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    expect(trigger?.getAttribute('aria-controls')).toBe('channels-body')

    await act(async () => trigger?.click())
    expect(onOpenChange).toHaveBeenCalledWith(false)

    act(() => root.unmount())
  })

  it('supports tree-style left and right arrow keys', async () => {
    const onOpenChange = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <SidebarSectionTrigger
          label="Workspaces"
          open={false}
          onOpenChange={onOpenChange}
          controls="workspaces-body"
        />
      )
    })
    const trigger = container.querySelector('button')

    await act(async () => {
      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(onOpenChange).toHaveBeenCalledWith(true)

    act(() => root.unmount())
  })

  it('removes collapsed content from interaction and assistive technology', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <SidebarCollapseReveal id="section-body" open={false}>
          <button type="button">Hidden row</button>
        </SidebarCollapseReveal>
      )
    })

    const body = container.querySelector('#section-body')
    expect(body?.getAttribute('aria-hidden')).toBe('true')
    expect(body?.hasAttribute('inert')).toBe(true)
    expect(body?.className).toContain('grid-rows-[0fr]')

    act(() => root.unmount())
  })
})

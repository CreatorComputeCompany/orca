/**
 * Radix mounts floating UI under `document.body` by default. When Orca is
 * embedded in another app, that leaves menus outside Orca's theme subtree and
 * makes them inherit the host's colors. Keep the standalone default, but use
 * the embed container as the default portal root when one is present.
 */
export function getOrcaWebEmbedPortalContainer(target: Window): HTMLElement | undefined {
  const value = (target as Window & { __ORCA_WEB_EMBED__?: unknown }).__ORCA_WEB_EMBED__
  if (value === null || typeof value !== 'object') {
    return undefined
  }
  const container = (value as { container?: unknown }).container
  return container instanceof HTMLElement ? container : undefined
}

export function defaultOrcaPortalContainer(): HTMLElement | undefined {
  return typeof window === 'undefined' ? undefined : getOrcaWebEmbedPortalContainer(window)
}

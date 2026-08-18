export type GsdWorktreeLink = {
  cardPublicId: string
  cardUrl: string
}

const GSD_EXTERNAL_LAUNCH_PREFIX = 'gsd:'
const GSD_CARD_ORIGIN = 'https://gsd.creatorcomputecompany.com'
const GSD_CARD_PUBLIC_ID_PATTERN = /^[a-zA-Z0-9_-]{1,160}$/

export function getGsdWorktreeLink(externalLaunchId?: string): GsdWorktreeLink | null {
  if (!externalLaunchId?.startsWith(GSD_EXTERNAL_LAUNCH_PREFIX)) {
    return null
  }
  const cardPublicId = externalLaunchId.slice(GSD_EXTERNAL_LAUNCH_PREFIX.length)
  if (!GSD_CARD_PUBLIC_ID_PATTERN.test(cardPublicId)) {
    return null
  }
  return {
    cardPublicId,
    cardUrl: `${GSD_CARD_ORIGIN}/cards/${encodeURIComponent(cardPublicId)}`
  }
}

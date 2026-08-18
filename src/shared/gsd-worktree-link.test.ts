import { describe, expect, it } from 'vitest'
import { getGsdWorktreeLink } from './gsd-worktree-link'

describe('getGsdWorktreeLink', () => {
  it('creates a card link from a GSD launch identity', () => {
    expect(getGsdWorktreeLink('gsd:p95gu2yxmd4x')).toEqual({
      cardPublicId: 'p95gu2yxmd4x',
      cardUrl: 'https://gsd.creatorcomputecompany.com/cards/p95gu2yxmd4x'
    })
  })

  it.each([undefined, '', 'other:card', 'gsd:', 'gsd:../admin'])(
    'rejects an invalid launch identity: %s',
    (externalLaunchId) => {
      expect(getGsdWorktreeLink(externalLaunchId)).toBeNull()
    }
  )
})

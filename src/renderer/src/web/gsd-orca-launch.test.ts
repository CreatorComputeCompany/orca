import { describe, expect, it } from 'vitest'
import { isGsdIdentityLinkRequired } from './gsd-orca-launch'

describe('GSD Orca launch errors', () => {
  it('recognizes the one-time account-link requirement', () => {
    expect(
      isGsdIdentityLinkRequired(
        new Error('Link this Orca member to GSD before opening card worktrees.')
      )
    ).toBe(true)
    expect(isGsdIdentityLinkRequired(new Error('GSD rejected this launch.'))).toBe(false)
    expect(isGsdIdentityLinkRequired('Link this Orca member to GSD')).toBe(false)
  })
})

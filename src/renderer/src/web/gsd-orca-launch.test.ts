import { describe, expect, it } from 'vitest'
import { isGsdIdentityLinkRequired, shouldConsumePendingGsdLaunch } from './gsd-orca-launch'

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

  it('waits for app hydration before consuming the pending launch', () => {
    expect(
      shouldConsumePendingGsdLaunch({
        hasMultiplayerAccount: true,
        hasPendingLaunch: true,
        appHydrated: false,
        alreadyStarted: false
      })
    ).toBe(false)
    expect(
      shouldConsumePendingGsdLaunch({
        hasMultiplayerAccount: true,
        hasPendingLaunch: true,
        appHydrated: true,
        alreadyStarted: false
      })
    ).toBe(true)
  })
})

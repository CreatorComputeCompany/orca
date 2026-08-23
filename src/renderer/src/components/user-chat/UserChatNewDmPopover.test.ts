import { describe, expect, it } from 'vitest'
import { filterUserChatDmMembers } from './UserChatNewDmPopover'

const members = [
  { pubkey: 'a'.repeat(64), displayName: 'Jake', avatarUrl: null },
  { pubkey: 'b'.repeat(64), displayName: 'Bob', avatarUrl: null },
  { pubkey: 'c'.repeat(64), displayName: 'Alice', avatarUrl: null }
]

describe('filterUserChatDmMembers', () => {
  it('excludes the current member and sorts the directory', () => {
    expect(
      filterUserChatDmMembers(members, 'a'.repeat(64), '').map((member) => member.displayName)
    ).toEqual(['Alice', 'Bob'])
  })

  it('searches names and pubkeys case-insensitively', () => {
    expect(
      filterUserChatDmMembers(members, null, 'BO').map((member) => member.displayName)
    ).toEqual(['Bob'])
    expect(
      filterUserChatDmMembers(members, null, 'cccc').map((member) => member.displayName)
    ).toEqual(['Alice'])
  })
})

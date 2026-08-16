import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MultiplayerAccountStore } from './multiplayer-account-store'
import type { MultiplayerMember } from './multiplayer-identity-store'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('MultiplayerAccountStore', () => {
  it('stores only a salted password hash and authenticates normalized email', async () => {
    const root = makeRoot()
    const store = new MultiplayerAccountStore(root)
    await store.register({
      email: '  Jake@Example.COM ',
      password: 'correct horse battery staple',
      member: member('jake', 'Jake')
    })

    const persisted = readFileSync(join(root, 'orca-multiplayer-accounts.json'), 'utf8')
    expect(persisted).not.toContain('correct horse battery staple')
    expect(persisted).toContain('jake@example.com')
    await expect(
      store.authenticate('JAKE@example.com', 'correct horse battery staple')
    ).resolves.toMatchObject({ memberKey: 'jake' })
    await expect(store.authenticate('jake@example.com', 'wrong password value')).resolves.toBeNull()
    await expect(
      store.authenticate('unknown@example.com', 'correct horse battery staple')
    ).resolves.toBeNull()
  })

  it('prevents duplicate email and member claims', async () => {
    const store = new MultiplayerAccountStore(makeRoot())
    await store.register({
      email: 'jake@example.com',
      password: 'correct horse battery staple',
      member: member('jake', 'Jake')
    })

    await expect(
      store.register({
        email: 'jake@example.com',
        password: 'another secure password',
        member: member('steven', 'Steven')
      })
    ).rejects.toThrow('already exists')
    await expect(
      store.register({
        email: 'other@example.com',
        password: 'another secure password',
        member: member('jake', 'Jake')
      })
    ).rejects.toThrow('already has an account')
  })

  it('fails closed when the account file is malformed', async () => {
    const root = makeRoot()
    writeFileSync(join(root, 'orca-multiplayer-accounts.json'), '{bad json', { mode: 0o600 })
    const store = new MultiplayerAccountStore(root)

    expect(() => store.hasAccounts()).toThrow('unreadable')
    await expect(
      store.authenticate('jake@example.com', 'correct horse battery staple')
    ).rejects.toThrow('unreadable')
  })
})

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'orca-multiplayer-account-'))
  roots.push(root)
  return root
}

function member(key: string, displayName: string): MultiplayerMember {
  return { key, displayName, deviceIds: [`${key}-device`], createdAt: 1, updatedAt: 1 }
}

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  importMultiplayerCodexAccountFromHome,
  listMultiplayerCodexAuthJson
} from './multiplayer-codex-account-store'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('multiplayer Codex account store', () => {
  it('isolates encrypted account pools by member and deduplicates retries', () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-member-codex-'))
    roots.push(root)
    const home = join(root, 'source-home')
    mkdirSync(home)
    const authJson = JSON.stringify({ tokens: { id_token: 'secret-token' } })
    writeFileSync(join(home, 'auth.json'), authJson)

    expect(
      importMultiplayerCodexAccountFromHome({
        userDataPath: root,
        memberKey: 'jake',
        sourceHome: home
      }).imported
    ).toBe(true)
    expect(
      importMultiplayerCodexAccountFromHome({
        userDataPath: root,
        memberKey: 'jake',
        sourceHome: home
      }).imported
    ).toBe(false)
    expect(listMultiplayerCodexAuthJson(root, 'jake')).toEqual([authJson])
    expect(listMultiplayerCodexAuthJson(root, 'steven')).toEqual([])
    expect(readFileSync(join(root, 'orca-multiplayer-codex-accounts.json'), 'utf8')).not.toContain(
      'secret-token'
    )
  })
})

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { writeSecureJsonFile } from '../../shared/secure-file'

const STORE_FILENAME = 'orca-multiplayer-codex-accounts.json'
const KEY_FILENAME = 'orca-multiplayer-codex-accounts.key.json'
const MAX_AUTH_JSON_BYTES = 2_000_000

type EncryptedAccount = {
  id: string
  iv: string
  tag: string
  ciphertext: string
}

type AccountStore = {
  version: 1
  members: Record<string, EncryptedAccount[]>
}

export function importMultiplayerCodexAccountFromHome(args: {
  userDataPath: string
  memberKey: string
  sourceHome: string
}): { imported: boolean; id: string } {
  const authPath = join(resolve(args.sourceHome.trim()), 'auth.json')
  const authJson = readFileSync(authPath, 'utf8')
  assertCodexAuthJson(authJson)
  const id = createHash('sha256').update(authJson).digest('hex')
  const store = readStore(args.userDataPath)
  const existing = store.members[args.memberKey] ?? []
  if (existing.some((account) => account.id === id)) {
    return { imported: false, id }
  }
  const key = readOrCreateKey(args.userDataPath)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(authJson, 'utf8'), cipher.final()])
  store.members[args.memberKey] = [
    ...existing,
    {
      id,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64')
    }
  ]
  writeSecureJsonFile(join(args.userDataPath, STORE_FILENAME), store)
  return { imported: true, id }
}

export function listMultiplayerCodexAuthJson(userDataPath: string, memberKey: string): string[] {
  const accounts = readStore(userDataPath).members[memberKey] ?? []
  if (accounts.length === 0) {
    return []
  }
  const key = readOrCreateKey(userDataPath)
  return accounts.map((account) => {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(account.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(account.tag, 'base64'))
    const authJson = Buffer.concat([
      decipher.update(Buffer.from(account.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8')
    assertCodexAuthJson(authJson)
    return authJson
  })
}

function assertCodexAuthJson(authJson: string): void {
  if (Buffer.byteLength(authJson, 'utf8') > MAX_AUTH_JSON_BYTES) {
    throw new Error('Codex auth.json is too large.')
  }
  const parsed = JSON.parse(authJson) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Codex auth.json must contain an object.')
  }
}

function readStore(userDataPath: string): AccountStore {
  const path = join(userDataPath, STORE_FILENAME)
  if (!existsSync(path)) {
    return { version: 1, members: {} }
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as AccountStore
  if (parsed.version !== 1 || !parsed.members || typeof parsed.members !== 'object') {
    throw new Error('Invalid multiplayer Codex account store.')
  }
  return parsed
}

function readOrCreateKey(userDataPath: string): Buffer {
  const path = join(userDataPath, KEY_FILENAME)
  if (existsSync(path)) {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { key?: unknown }
    if (typeof parsed.key !== 'string') {
      throw new Error('Invalid multiplayer Codex account key.')
    }
    const key = Buffer.from(parsed.key, 'base64')
    if (key.length !== 32) {
      throw new Error('Invalid multiplayer Codex account key length.')
    }
    return key
  }
  const key = randomBytes(32)
  writeSecureJsonFile(path, { version: 1, key: key.toString('base64') })
  return key
}

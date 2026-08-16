import { randomBytes, scrypt as deriveScryptKey, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import {
  MultiplayerEmailSchema,
  MultiplayerPasswordSchema
} from '../../shared/multiplayer-auth-contract'
import { hardenExistingSecureFile, writeDurableSecureJsonFile } from '../../shared/secure-file'
import type { MultiplayerMember } from './multiplayer-identity-store'

const ACCOUNT_STORE_FILE = 'orca-multiplayer-accounts.json'
const SCRYPT_COST = 32_768
const SCRYPT_BLOCK_SIZE = 8
const SCRYPT_PARALLELISM = 1
const SCRYPT_KEY_BYTES = 32
const SCRYPT_MAX_MEMORY_BYTES = 64 * 1024 * 1024

const PasswordHashSchema = z.object({
  algorithm: z.literal('scrypt'),
  saltB64: z.string().min(1),
  hashB64: z.string().min(1),
  cost: z.literal(SCRYPT_COST),
  blockSize: z.literal(SCRYPT_BLOCK_SIZE),
  parallelism: z.literal(SCRYPT_PARALLELISM)
})

const AccountSchema = z.object({
  email: MultiplayerEmailSchema,
  memberKey: z.string().min(1),
  displayName: z.string().min(1).max(80),
  passwordHash: PasswordHashSchema,
  createdAt: z.number().finite(),
  updatedAt: z.number().finite()
})

const StoreSchema = z.object({
  version: z.literal(1),
  accounts: z.array(AccountSchema).max(32)
})

export type MultiplayerAccount = z.infer<typeof AccountSchema>

export class MultiplayerAccountStore {
  private readonly path: string
  private mutation: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    this.path = join(userDataPath, ACCOUNT_STORE_FILE)
  }

  hasAccounts(): boolean {
    return this.read().accounts.length > 0
  }

  async register(args: {
    email: string
    password: string
    member: MultiplayerMember
  }): Promise<MultiplayerAccount> {
    const email = MultiplayerEmailSchema.parse(args.email)
    const password = MultiplayerPasswordSchema.parse(args.password)
    const passwordHash = await hashPassword(password)
    let registered: MultiplayerAccount | null = null
    const write = this.mutation.then(() => {
      const store = this.read()
      if (store.accounts.some((account) => account.email === email)) {
        throw new Error('An account already exists for this email address.')
      }
      if (store.accounts.some((account) => account.memberKey === args.member.key)) {
        throw new Error('This member already has an account.')
      }
      const now = Date.now()
      registered = AccountSchema.parse({
        email,
        memberKey: args.member.key,
        displayName: args.member.displayName,
        passwordHash,
        createdAt: now,
        updatedAt: now
      })
      writeDurableSecureJsonFile(this.path, {
        version: 1,
        accounts: [...store.accounts, registered]
      })
    })
    this.mutation = write.catch(() => {})
    await write
    if (!registered) {
      throw new Error('Account registration failed.')
    }
    return registered
  }

  async authenticate(
    emailInput: string,
    passwordInput: string
  ): Promise<MultiplayerAccount | null> {
    const email = MultiplayerEmailSchema.safeParse(emailInput)
    const password = MultiplayerPasswordSchema.safeParse(passwordInput)
    const account = email.success
      ? this.read().accounts.find((candidate) => candidate.email === email.data)
      : undefined
    const passwordHash = account?.passwordHash ?? dummyPasswordHash()
    const observed = await derivePassword(password.success ? password.data : '', passwordHash)
    const expected = Buffer.from(passwordHash.hashB64, 'base64')
    const matches =
      observed.byteLength === expected.byteLength && timingSafeEqual(observed, expected)
    return account && password.success && matches ? account : null
  }

  private read(): z.infer<typeof StoreSchema> {
    if (!existsSync(this.path)) {
      return { version: 1, accounts: [] }
    }
    hardenExistingSecureFile(this.path)
    try {
      return StoreSchema.parse(JSON.parse(readFileSync(this.path, 'utf8')))
    } catch {
      throw new Error('The multiplayer account store is unreadable.')
    }
  }
}

async function hashPassword(password: string): Promise<z.infer<typeof PasswordHashSchema>> {
  const salt = randomBytes(16)
  const hash = await derivePassword(password, {
    algorithm: 'scrypt',
    saltB64: salt.toString('base64'),
    hashB64: '',
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelism: SCRYPT_PARALLELISM
  })
  return {
    algorithm: 'scrypt',
    saltB64: salt.toString('base64'),
    hashB64: hash.toString('base64'),
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelism: SCRYPT_PARALLELISM
  }
}

function derivePassword(
  password: string,
  parameters: z.infer<typeof PasswordHashSchema>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    deriveScryptKey(
      password,
      Buffer.from(parameters.saltB64, 'base64'),
      SCRYPT_KEY_BYTES,
      {
        N: parameters.cost,
        r: parameters.blockSize,
        p: parameters.parallelism,
        maxmem: SCRYPT_MAX_MEMORY_BYTES
      },
      (error, key) => (error ? reject(error) : resolve(key))
    )
  })
}

function dummyPasswordHash(): z.infer<typeof PasswordHashSchema> {
  return {
    algorithm: 'scrypt',
    saltB64: 'AAAAAAAAAAAAAAAAAAAAAA==',
    hashB64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelism: SCRYPT_PARALLELISM
  }
}

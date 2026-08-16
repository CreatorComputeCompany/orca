import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { hardenExistingSecureFile, writeDurableSecureJsonFile } from '../../shared/secure-file'
import type { EphemeralVmRuntimeRecord } from '../../shared/ephemeral-vm-runtimes'

const MEMBER_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/
const STORE_FILE = 'orca-multiplayer-identities.json'

const MemberSchema = z.object({
  key: z.string().regex(MEMBER_KEY_PATTERN),
  displayName: z.string().min(1).max(80),
  deviceIds: z.array(z.string().min(1)).max(32),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite()
})

const StoreSchema = z.object({
  version: z.literal(1),
  members: z.array(MemberSchema).max(32)
})

export type MultiplayerMember = z.infer<typeof MemberSchema>

export function normalizeMultiplayerMemberKey(value: string): string {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!MEMBER_KEY_PATTERN.test(key)) {
    throw new Error('Enter a name using letters and numbers.')
  }
  return key
}

export function enrollMultiplayerDevice(args: {
  userDataPath: string
  memberKey: string
  displayName: string
  deviceId: string
}): MultiplayerMember {
  const key = normalizeMultiplayerMemberKey(args.memberKey)
  const displayName = args.displayName.trim()
  if (!displayName || displayName.length > 80 || !args.deviceId.trim()) {
    throw new Error('Invalid multiplayer member.')
  }
  const store = readStore(args.userDataPath)
  const now = Date.now()
  const existing = store.members.find((member) => member.key === key)
  const member = MemberSchema.parse({
    key,
    displayName,
    deviceIds: [...new Set([...(existing?.deviceIds ?? []), args.deviceId])],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  })
  const members = store.members
    .map((candidate) => ({
      ...candidate,
      deviceIds: candidate.deviceIds.filter((deviceId) => deviceId !== args.deviceId)
    }))
    .filter((candidate) => candidate.deviceIds.length > 0 && candidate.key !== key)
  writeDurableSecureJsonFile(storePath(args.userDataPath), {
    version: 1,
    members: [...members, member]
  })
  return member
}

export function findMultiplayerMemberByDevice(
  userDataPath: string,
  deviceId: string
): MultiplayerMember | null {
  return (
    readStore(userDataPath).members.find((member) => member.deviceIds.includes(deviceId)) ?? null
  )
}

export function devicesBelongToSameMember(
  userDataPath: string,
  firstDeviceId: string,
  secondDeviceId: string
): boolean {
  if (firstDeviceId === secondDeviceId) {
    return true
  }
  const member = findMultiplayerMemberByDevice(userDataPath, firstDeviceId)
  return member?.deviceIds.includes(secondDeviceId) ?? false
}

export function canDeviceAccessEphemeralVmRuntime(
  userDataPath: string,
  deviceId: string,
  runtime: EphemeralVmRuntimeRecord
): boolean {
  if (runtime.sharing === 'shared') {
    return true
  }
  const creator = runtime.creatorProvenance
  return (
    creator?.kind === 'paired-device' &&
    devicesBelongToSameMember(userDataPath, deviceId, creator.deviceId)
  )
}

function storePath(userDataPath: string): string {
  return join(userDataPath, STORE_FILE)
}

function readStore(userDataPath: string): z.infer<typeof StoreSchema> {
  const path = storePath(userDataPath)
  if (!existsSync(path)) {
    return { version: 1, members: [] }
  }
  hardenExistingSecureFile(path)
  try {
    return StoreSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return { version: 1, members: [] }
  }
}

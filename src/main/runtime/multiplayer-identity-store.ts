import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { hardenExistingSecureFile, writeDurableSecureJsonFile } from '../../shared/secure-file'
import type { EphemeralVmRuntimeRecord } from '../../shared/ephemeral-vm-runtimes'

const MEMBER_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/
const STORE_FILE = 'orca-multiplayer-identities.json'

const ExternalIdentitySchema = z.object({
  issuer: z.string().url().max(512),
  subject: z.string().min(1).max(512),
  email: z.string().email().max(254),
  linkedAt: z.number().finite(),
  lastValidatedAt: z.number().finite()
})

const MemberSchema = z.object({
  key: z.string().regex(MEMBER_KEY_PATTERN),
  displayName: z.string().min(1).max(80),
  deviceIds: z.array(z.string().min(1)).max(32),
  externalIdentities: z.array(ExternalIdentitySchema).max(8).default([]),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite()
})

const StoreSchema = z.object({
  version: z.literal(1),
  members: z.array(MemberSchema).max(1000)
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
    externalIdentities: existing?.externalIdentities ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  })
  const members = store.members
    .map((candidate) => ({
      ...candidate,
      deviceIds: candidate.deviceIds.filter((deviceId) => deviceId !== args.deviceId)
    }))
    .filter(
      (candidate) =>
        (candidate.deviceIds.length > 0 || candidate.externalIdentities.length > 0) &&
        candidate.key !== key
    )
  writeDurableSecureJsonFile(storePath(args.userDataPath), {
    version: 1,
    members: [...members, member]
  })
  return member
}

export function findMultiplayerMemberByExternalIdentity(
  userDataPath: string,
  identity: { issuer: string; subject: string }
): MultiplayerMember | null {
  return (
    readStore(userDataPath).members.find((member) =>
      member.externalIdentities.some(
        (candidate) =>
          candidate.issuer === identity.issuer && candidate.subject === identity.subject
      )
    ) ?? null
  )
}

export function linkMultiplayerMemberExternalIdentity(args: {
  userDataPath: string
  memberKey: string
  issuer: string
  subject: string
  email: string
}): MultiplayerMember {
  const store = readStore(args.userDataPath)
  const member = store.members.find((candidate) => candidate.key === args.memberKey)
  if (!member) {
    throw new Error('The Orca member no longer exists.')
  }
  const claimed = store.members.find((candidate) =>
    candidate.externalIdentities.some(
      (identity) => identity.issuer === args.issuer && identity.subject === args.subject
    )
  )
  if (claimed && claimed.key !== member.key) {
    throw new Error('This GSD account is already linked to another Orca member.')
  }
  const now = Date.now()
  const externalIdentity = ExternalIdentitySchema.parse({
    issuer: args.issuer,
    subject: args.subject,
    email: args.email.trim().toLowerCase(),
    linkedAt:
      member.externalIdentities.find(
        (identity) => identity.issuer === args.issuer && identity.subject === args.subject
      )?.linkedAt ?? now,
    lastValidatedAt: now
  })
  const linked = MemberSchema.parse({
    ...member,
    externalIdentities: [
      ...member.externalIdentities.filter(
        (identity) => identity.issuer !== args.issuer || identity.subject !== args.subject
      ),
      externalIdentity
    ],
    updatedAt: now
  })
  writeDurableSecureJsonFile(storePath(args.userDataPath), {
    version: 1,
    members: store.members.map((candidate) => (candidate.key === linked.key ? linked : candidate))
  })
  return linked
}

export function createMultiplayerMemberForExternalIdentity(args: {
  userDataPath: string
  displayName: string
  issuer: string
  subject: string
  email: string
  memberKey?: string
}): MultiplayerMember {
  const store = readStore(args.userDataPath)
  const existing = findMultiplayerMemberByExternalIdentity(args.userDataPath, args)
  if (existing) {
    return existing
  }
  const baseKey = normalizeMultiplayerMemberKey(args.memberKey ?? args.displayName)
  let key = baseKey
  for (let suffix = 2; store.members.some((member) => member.key === key); suffix += 1) {
    key = `${baseKey.slice(0, Math.max(1, 63 - String(suffix).length - 1))}-${suffix}`
  }
  const now = Date.now()
  const member = MemberSchema.parse({
    key,
    displayName: args.displayName.trim(),
    deviceIds: [],
    externalIdentities: [
      {
        issuer: args.issuer,
        subject: args.subject,
        email: args.email.trim().toLowerCase(),
        linkedAt: now,
        lastValidatedAt: now
      }
    ],
    createdAt: now,
    updatedAt: now
  })
  writeDurableSecureJsonFile(storePath(args.userDataPath), {
    version: 1,
    members: [...store.members, member]
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

export function findMultiplayerMemberByKey(
  userDataPath: string,
  memberKey: string
): MultiplayerMember | null {
  return readStore(userDataPath).members.find((member) => member.key === memberKey) ?? null
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
  const actorMember = findMultiplayerMemberByDevice(userDataPath, deviceId)
  const ownerMemberKey = resolveEphemeralVmRuntimeOwnerMemberKey(userDataPath, runtime)
  if (ownerMemberKey) {
    return actorMember?.key === ownerMemberKey
  }
  const creator = runtime.creatorProvenance
  return (
    creator?.kind === 'paired-device' &&
    devicesBelongToSameMember(userDataPath, deviceId, creator.deviceId)
  )
}

export function resolveEphemeralVmRuntimeOwnerMemberKey(
  userDataPath: string,
  runtime: EphemeralVmRuntimeRecord
): string | null {
  if (runtime.ownerMemberKey) {
    return runtime.ownerMemberKey
  }
  const creator = runtime.creatorProvenance
  return creator?.kind === 'paired-device'
    ? (findMultiplayerMemberByDevice(userDataPath, creator.deviceId)?.key ?? null)
    : null
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

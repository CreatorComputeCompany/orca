import { z } from 'zod'

const ManagedRuntimeGrantKeySchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/)

export const ManagedRuntimeOfferParamsSchema = z.object({
  grantKey: ManagedRuntimeGrantKeySchema,
  name: z.string().min(1).max(80)
})

export type ManagedRuntimeOfferParams = z.infer<typeof ManagedRuntimeOfferParamsSchema>

export type ManagedRuntimeOfferResult = {
  pairingUrl: string
  deviceId: string
}

export const ManagedRuntimeRevokeParamsSchema = z.object({
  retainGrantKeys: z.array(ManagedRuntimeGrantKeySchema).max(32)
})

export type ManagedRuntimeRevokeParams = z.infer<typeof ManagedRuntimeRevokeParamsSchema>

export type ManagedRuntimeRevokeResult = {
  revoked: number
}

export type ManagedRuntimePresenceResult = {
  members: { grantKey: string; worktreeId: string }[]
}

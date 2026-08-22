import { z } from 'zod'

export const MultiplayerIdentityEnrollParamsSchema = z.object({
  memberKey: z.string().min(1).max(80),
  displayName: z.string().min(1).max(80)
})

export type MultiplayerIdentityEnrollParams = z.infer<typeof MultiplayerIdentityEnrollParamsSchema>

export type MultiplayerIdentityEnrollResult = {
  member: {
    key: string
    displayName: string
    deviceIds: string[]
  }
  pairingUrl: string
}

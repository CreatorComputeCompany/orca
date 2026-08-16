import { z } from 'zod'

export const MultiplayerEmailSchema = z.string().trim().toLowerCase().email().max(254)
export const MultiplayerPasswordSchema = z.string().min(12).max(256)

export const MultiplayerAuthRegisterParamsSchema = z.object({
  email: MultiplayerEmailSchema,
  password: MultiplayerPasswordSchema,
  displayName: z.string().trim().min(1).max(80)
})

export const MultiplayerAuthLoginParamsSchema = z.object({
  email: MultiplayerEmailSchema,
  password: MultiplayerPasswordSchema
})

export type MultiplayerAuthRegisterParams = z.infer<typeof MultiplayerAuthRegisterParamsSchema>
export type MultiplayerAuthLoginParams = z.infer<typeof MultiplayerAuthLoginParamsSchema>

export type MultiplayerAuthResult = {
  email: string
  member: {
    key: string
    displayName: string
    deviceIds: string[]
  }
  pairingUrl: string
}

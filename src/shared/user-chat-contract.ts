import { z } from 'zod'

export const UserChatChannelIdSchema = z.string().uuid()

export const UserChatChannelSchema = z.object({
  id: UserChatChannelIdSchema,
  name: z.string(),
  type: z.enum(['channel', 'dm']),
  visibility: z.enum(['open', 'private']),
  participantPubkeys: z.array(z.string().regex(/^[0-9a-f]{64}$/i))
})

export const UserChatProfileSchema = z.object({
  pubkey: z.string().regex(/^[0-9a-f]{64}$/i),
  displayName: z.string().min(1).max(80),
  avatarUrl: z.string().url().nullable()
})

export const UserChatMemberSchema = UserChatProfileSchema

export const UserChatEventSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{64}$/i),
  pubkey: z.string().regex(/^[0-9a-f]{64}$/i),
  created_at: z.number().int().nonnegative(),
  kind: z.number().int(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string()
})

export const UserChatBootstrapSchema = z.object({
  pubkey: z.string().regex(/^[0-9a-f]{64}$/i),
  channels: z.array(UserChatChannelSchema),
  profiles: z.array(UserChatProfileSchema),
  members: z.array(UserChatMemberSchema)
})

export const UserChatHistoryParamsSchema = z.object({
  channelId: UserChatChannelIdSchema
})

export const UserChatHistorySchema = z.object({
  events: z.array(UserChatEventSchema),
  profiles: z.array(UserChatProfileSchema)
})

export const UserChatSendParamsSchema = z.object({
  channelId: UserChatChannelIdSchema,
  content: z.string().trim().min(1).max(100_000)
})

export const UserChatOpenDmParamsSchema = z.object({
  participantPubkeys: z
    .array(z.string().regex(/^[0-9a-f]{64}$/i))
    .min(1)
    .max(8)
})

export type UserChatChannel = z.infer<typeof UserChatChannelSchema>
export type UserChatProfile = z.infer<typeof UserChatProfileSchema>
export type UserChatMember = z.infer<typeof UserChatMemberSchema>
export type UserChatEvent = z.infer<typeof UserChatEventSchema>
export type UserChatBootstrap = z.infer<typeof UserChatBootstrapSchema>
export type UserChatHistory = z.infer<typeof UserChatHistorySchema>
export type UserChatHistoryParams = z.infer<typeof UserChatHistoryParamsSchema>
export type UserChatSendParams = z.infer<typeof UserChatSendParamsSchema>
export type UserChatOpenDmParams = z.infer<typeof UserChatOpenDmParamsSchema>

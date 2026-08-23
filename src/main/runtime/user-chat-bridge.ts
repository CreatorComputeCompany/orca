import type { z } from 'zod'
import {
  UserChatBootstrapSchema,
  UserChatChannelSchema,
  UserChatEventSchema,
  UserChatHistorySchema,
  UserChatSurfaceSchema,
  type UserChatHistoryParams,
  type UserChatOpenDmParams,
  type UserChatSurfaceParams,
  type UserChatSendParams
} from '../../shared/user-chat-contract'

const DEFAULT_USER_CHAT_API_URL = 'https://imabird-buzz-web-api.fly.dev'
const USER_CHAT_REQUEST_TIMEOUT_MS = 15_000

export type UserChatActor = {
  controllerId: string
  memberKey: string
  displayName: string
  email?: string
}

type UserChatEnvironment = Pick<
  NodeJS.ProcessEnv,
  'ORCA_USER_CHAT_API_URL' | 'ORCA_CHAT_BRIDGE_SECRET'
>

async function callUserChatBridge<TSchema extends z.ZodType>(args: {
  actor: UserChatActor
  path: 'bootstrap' | 'history' | 'open-dm' | 'send' | 'surface'
  payload?: Record<string, unknown>
  schema: TSchema
  environment?: UserChatEnvironment
}): Promise<z.infer<TSchema>> {
  const environment = args.environment ?? process.env
  const secret = environment.ORCA_CHAT_BRIDGE_SECRET
  if (!secret) {
    throw new Error('user_chat_not_configured')
  }
  const apiUrl = (environment.ORCA_USER_CHAT_API_URL ?? DEFAULT_USER_CHAT_API_URL).replace(
    /\/+$/,
    ''
  )
  const response = await fetch(`${apiUrl}/api/internal/orca-chat/${args.path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ actor: args.actor, ...args.payload }),
    signal: AbortSignal.timeout(USER_CHAT_REQUEST_TIMEOUT_MS)
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `user_chat_http_${response.status}`)
  }
  return args.schema.parse(await response.json())
}

export function bootstrapUserChat(actor: UserChatActor) {
  return callUserChatBridge({ actor, path: 'bootstrap', schema: UserChatBootstrapSchema })
}

export function getUserChatHistory(actor: UserChatActor, params: UserChatHistoryParams) {
  return callUserChatBridge({
    actor,
    path: 'history',
    payload: params,
    schema: UserChatHistorySchema
  })
}

export function sendUserChatMessage(actor: UserChatActor, params: UserChatSendParams) {
  return callUserChatBridge({
    actor,
    path: 'send',
    payload: params,
    schema: UserChatEventSchema
  })
}

export function openUserChatDm(actor: UserChatActor, params: UserChatOpenDmParams) {
  return callUserChatBridge({
    actor,
    path: 'open-dm',
    payload: params,
    schema: UserChatChannelSchema
  })
}

export function getUserChatSurface(actor: UserChatActor, params: UserChatSurfaceParams) {
  return callUserChatBridge({
    actor,
    path: 'surface',
    payload: params,
    schema: UserChatSurfaceSchema
  })
}

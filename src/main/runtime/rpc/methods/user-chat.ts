import {
  UserChatHistoryParamsSchema,
  UserChatOpenDmParamsSchema,
  UserChatSendParamsSchema
} from '../../../../shared/user-chat-contract'
import { defineMethod, type RpcAnyMethod } from '../core'

export const USER_CHAT_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'userChat.bootstrap',
    params: null,
    handler: async (_params, context) => {
      if (!context.pairing?.bootstrapUserChat) {
        throw new Error('user_chat_unavailable')
      }
      return await context.pairing.bootstrapUserChat()
    }
  }),
  defineMethod({
    name: 'userChat.openDm',
    params: UserChatOpenDmParamsSchema,
    handler: async (params, context) => {
      if (!context.pairing?.openUserChatDm) {
        throw new Error('user_chat_unavailable')
      }
      return await context.pairing.openUserChatDm(params)
    }
  }),
  defineMethod({
    name: 'userChat.history',
    params: UserChatHistoryParamsSchema,
    handler: async (params, context) => {
      if (!context.pairing?.getUserChatHistory) {
        throw new Error('user_chat_unavailable')
      }
      return await context.pairing.getUserChatHistory(params)
    }
  }),
  defineMethod({
    name: 'userChat.send',
    params: UserChatSendParamsSchema,
    handler: async (params, context) => {
      if (!context.pairing?.sendUserChatMessage) {
        throw new Error('user_chat_unavailable')
      }
      return await context.pairing.sendUserChatMessage(params)
    }
  })
]

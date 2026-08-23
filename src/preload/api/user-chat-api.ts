import type {
  UserChatBootstrap,
  UserChatEvent,
  UserChatHistory,
  UserChatHistoryParams,
  UserChatSendParams
} from '../../shared/user-chat-contract'

export type UserChatApi = {
  bootstrap: () => Promise<UserChatBootstrap>
  history: (params: UserChatHistoryParams) => Promise<UserChatHistory>
  send: (params: UserChatSendParams) => Promise<UserChatEvent>
}

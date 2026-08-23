import type {
  UserChatBootstrap,
  UserChatChannel,
  UserChatEvent,
  UserChatHistory,
  UserChatHistoryParams,
  UserChatOpenDmParams,
  UserChatSendParams
} from '../../shared/user-chat-contract'

export type UserChatApi = {
  bootstrap: () => Promise<UserChatBootstrap>
  history: (params: UserChatHistoryParams) => Promise<UserChatHistory>
  openDm: (params: UserChatOpenDmParams) => Promise<UserChatChannel>
  send: (params: UserChatSendParams) => Promise<UserChatEvent>
}

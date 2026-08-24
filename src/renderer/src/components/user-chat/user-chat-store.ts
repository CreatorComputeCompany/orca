import { useSyncExternalStore } from 'react'
import type {
  UserChatChannel,
  UserChatEvent,
  UserChatMember,
  UserChatProfile
} from '../../../../shared/user-chat-contract'

type UserChatState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  pubkey: string | null
  channels: UserChatChannel[]
  members: UserChatMember[]
  profiles: Record<string, UserChatProfile>
  selectedChannelId: string | null
  eventsByChannel: Record<string, UserChatEvent[]>
  sending: boolean
  openingDm: boolean
}

let state: UserChatState = {
  status: 'idle',
  error: null,
  pubkey: null,
  channels: [],
  members: [],
  profiles: {},
  selectedChannelId: null,
  eventsByChannel: {},
  sending: false,
  openingDm: false
}

const listeners = new Set<() => void>()
let bootstrapPromise: Promise<void> | null = null
const historyPromises = new Map<string, Promise<void>>()

export function sortUserChatChannels(channels: UserChatChannel[]): UserChatChannel[] {
  return [...channels].sort(
    (left, right) =>
      right.lastActivityAtMs - left.lastActivityAtMs ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id)
  )
}

function update(patch: Partial<UserChatState>): void {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

function mergeProfiles(profiles: UserChatProfile[]): Record<string, UserChatProfile> {
  const next = { ...state.profiles }
  for (const profile of profiles) {
    next[profile.pubkey] = profile
  }
  return next
}

export function subscribeUserChat(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getUserChatState(): UserChatState {
  return state
}

export function useUserChatState(): UserChatState {
  return useSyncExternalStore(subscribeUserChat, getUserChatState, getUserChatState)
}

export async function ensureUserChatBootstrap(force = false, background = false): Promise<void> {
  if (!window.api.userChat) {
    update({ status: 'error', error: 'User chat requires the Orca Cloud controller.' })
    return
  }
  if (bootstrapPromise) {
    return bootstrapPromise
  }
  if (!force && state.status === 'ready') {
    return bootstrapPromise ?? undefined
  }
  if (!background || state.status !== 'ready') {
    update({ status: 'loading', error: null })
  }
  const request = window.api.userChat
    .bootstrap()
    .then((result) => {
      update({
        status: 'ready',
        pubkey: result.pubkey,
        channels: sortUserChatChannels(result.channels),
        members: result.members,
        profiles: mergeProfiles(result.profiles),
        selectedChannelId:
          state.selectedChannelId &&
          result.channels.some((channel) => channel.id === state.selectedChannelId)
            ? state.selectedChannelId
            : null
      })
    })
    .catch((error: unknown) => {
      update({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unable to load conversations.'
      })
    })
    .finally(() => {
      if (bootstrapPromise === request) {
        bootstrapPromise = null
      }
    })
  bootstrapPromise = request
  return request
}

export async function openUserChatDm(participantPubkey: string): Promise<UserChatChannel | null> {
  if (!window.api.userChat || state.openingDm) {
    return null
  }
  update({ openingDm: true, error: null })
  try {
    const channel = await window.api.userChat.openDm({ participantPubkeys: [participantPubkey] })
    update({
      channels: [channel, ...state.channels.filter((candidate) => candidate.id !== channel.id)],
      selectedChannelId: channel.id
    })
    void loadUserChatHistory(channel.id)
    return channel
  } catch (error) {
    update({ error: error instanceof Error ? error.message : 'Unable to open direct message.' })
    return null
  } finally {
    update({ openingDm: false })
  }
}

export function selectUserChatChannel(channelId: string): void {
  update({
    selectedChannelId: channelId,
    channels: state.channels.map((channel) =>
      channel.id === channelId ? { ...channel, unreadCount: 0 } : channel
    )
  })
  void loadUserChatHistory(channelId)
}

export async function loadUserChatHistory(channelId: string): Promise<void> {
  if (!window.api.userChat || historyPromises.has(channelId)) {
    return historyPromises.get(channelId)
  }
  const request = window.api.userChat
    .history({ channelId })
    .then((result) => {
      const events = [...result.events].sort(
        (left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id)
      )
      update({
        profiles: mergeProfiles(result.profiles),
        eventsByChannel: { ...state.eventsByChannel, [channelId]: events }
      })
    })
    .catch((error: unknown) => {
      update({ error: error instanceof Error ? error.message : 'Unable to load messages.' })
    })
    .finally(() => historyPromises.delete(channelId))
  historyPromises.set(channelId, request)
  return request
}

export async function sendUserChatMessage(channelId: string, content: string): Promise<boolean> {
  if (!window.api.userChat || state.sending || !content.trim()) {
    return false
  }
  update({ sending: true, error: null })
  try {
    const event = await window.api.userChat.send({ channelId, content })
    const existing = state.eventsByChannel[channelId] ?? []
    update({
      eventsByChannel: {
        ...state.eventsByChannel,
        [channelId]: [...existing.filter((candidate) => candidate.id !== event.id), event].sort(
          (left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id)
        )
      }
    })
    return true
  } catch (error) {
    update({ error: error instanceof Error ? error.message : 'Unable to send message.' })
    return false
  } finally {
    update({ sending: false })
  }
}

export function userChatChannelLabel(channel: UserChatChannel, snapshot = state): string {
  if (channel.type === 'channel') {
    return channel.name || 'untitled'
  }
  const other = channel.participantPubkeys.find((pubkey) => pubkey !== snapshot.pubkey)
  return (other && snapshot.profiles[other]?.displayName) || channel.name || 'Direct message'
}

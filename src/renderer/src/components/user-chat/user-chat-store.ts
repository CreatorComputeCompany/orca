import { useSyncExternalStore } from 'react'
import type {
  UserChatChannel,
  UserChatEvent,
  UserChatProfile
} from '../../../../shared/user-chat-contract'

type UserChatState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  pubkey: string | null
  channels: UserChatChannel[]
  profiles: Record<string, UserChatProfile>
  selectedChannelId: string | null
  eventsByChannel: Record<string, UserChatEvent[]>
  sending: boolean
}

let state: UserChatState = {
  status: 'idle',
  error: null,
  pubkey: null,
  channels: [],
  profiles: {},
  selectedChannelId: null,
  eventsByChannel: {},
  sending: false
}

const listeners = new Set<() => void>()
let bootstrapPromise: Promise<void> | null = null
const historyPromises = new Map<string, Promise<void>>()

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

export async function ensureUserChatBootstrap(force = false): Promise<void> {
  if (!window.api.userChat) {
    update({ status: 'error', error: 'User chat requires the Orca Cloud controller.' })
    return
  }
  if (!force && (state.status === 'ready' || bootstrapPromise)) {
    return bootstrapPromise ?? undefined
  }
  update({ status: 'loading', error: null })
  const request = window.api.userChat
    .bootstrap()
    .then((result) => {
      update({
        status: 'ready',
        pubkey: result.pubkey,
        channels: result.channels,
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

export function selectUserChatChannel(channelId: string): void {
  update({ selectedChannelId: channelId })
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

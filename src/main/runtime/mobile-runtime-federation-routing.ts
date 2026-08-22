import type { RuntimeRpcResponse } from '../../shared/runtime-rpc-envelope'
import type { RuntimeWorktreePsSummary } from '../../shared/runtime-types'

export function isWorktreeSummary(value: unknown): value is RuntimeWorktreePsSummary {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { worktreeId?: unknown }).worktreeId === 'string'
  )
}

export function normalizeFederatedWorktreeLimit(
  limit: number | undefined,
  fallback: number
): number {
  return typeof limit === 'number' && Number.isFinite(limit) && limit >= 0
    ? Math.floor(limit)
    : fallback
}

export function asFederationRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

export function firstFederationString(
  record: Record<string, unknown>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return null
}

export function stripFederatedSelectorPrefix(value: string): string {
  return value.startsWith('id:') ? value.slice(3) : value
}

export function isForwardedSubscription(method: string): boolean {
  return method === 'session.tabs.subscribe' || method === 'terminal.subscribe'
}

export function isSubscriptionCleanup(method: string): boolean {
  return method === 'session.tabs.unsubscribe' || method === 'terminal.unsubscribe'
}

export function isTerminalHandleKey(key: string): boolean {
  return key === 'handle' || key === 'terminal' || key === 'terminalHandle'
}

export function visitFederatedResponseValues(
  value: unknown,
  visit: (key: string, value: unknown) => void,
  key = ''
): void {
  visit(key, value)
  if (Array.isArray(value)) {
    for (const entry of value) {
      visitFederatedResponseValues(entry, visit)
    }
    return
  }
  if (typeof value !== 'object' || value === null) {
    return
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    visitFederatedResponseValues(childValue, visit, childKey)
  }
}

export function federatedResponseStreamId(response: RuntimeRpcResponse<unknown>): number | null {
  if (!response.ok) {
    return null
  }
  const result = asFederationRecord(response.result)
  return typeof result.streamId === 'number' && Number.isInteger(result.streamId)
    ? result.streamId
    : null
}

export function federatedResponseEndsStream(response: RuntimeRpcResponse<unknown>): boolean {
  return response.ok && asFederationRecord(response.result).type === 'end'
}

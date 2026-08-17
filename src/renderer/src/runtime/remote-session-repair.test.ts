import { describe, expect, it } from 'vitest'
import { shouldRestartRemoteSessionMirror } from './remote-session-repair'

describe('remote session repair', () => {
  it('restarts only when browser-local terminal state crosses from populated to empty', () => {
    expect(shouldRestartRemoteSessionMirror({ previousTerminalCount: 4, terminalCount: 0 })).toBe(
      true
    )
    expect(shouldRestartRemoteSessionMirror({ previousTerminalCount: 0, terminalCount: 0 })).toBe(
      false
    )
    expect(shouldRestartRemoteSessionMirror({ previousTerminalCount: 0, terminalCount: 4 })).toBe(
      false
    )
    expect(shouldRestartRemoteSessionMirror({ previousTerminalCount: 4, terminalCount: 3 })).toBe(
      false
    )
  })
})

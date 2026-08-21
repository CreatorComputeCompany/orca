import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeClient } from '../runtime-client'
import { parseArgs } from '../args'
import { printHelp } from '../help'
import { COMMAND_SPECS } from '../specs'
import { TERMINAL_HANDLERS } from './terminal'

describe('terminal close CLI', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the default close RPC unchanged', async () => {
    const call = vi.fn().mockResolvedValue({
      result: { close: { handle: 'term-1', tabId: 'tab-1', ptyKilled: true } }
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await TERMINAL_HANDLERS['terminal close']({
      flags: new Map([['terminal', 'term-1']]),
      client: { call } as unknown as RuntimeClient,
      cwd: '/tmp/worktree',
      json: true
    })

    expect(call).toHaveBeenCalledWith('terminal.close', { terminal: 'term-1' })
  })

  it('routes --tab to the durable whole-tab RPC', async () => {
    const parsed = parseArgs(['terminal', 'close', '--terminal', 'term-1', '--tab'])
    const call = vi.fn().mockResolvedValue({
      result: {
        close: {
          handle: 'term-1',
          tabId: 'tab-1',
          closeMode: 'tab',
          ptyKilled: false
        }
      }
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await TERMINAL_HANDLERS['terminal close']({
      flags: parsed.flags,
      client: { call } as unknown as RuntimeClient,
      cwd: '/tmp/worktree',
      json: true
    })

    expect(parsed.flags.get('tab')).toBe(true)
    expect(call).toHaveBeenCalledWith('terminal.closeTab', { terminal: 'term-1' })
  })

  it('documents that --tab waits for durable persistence', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    printHelp(COMMAND_SPECS, ['terminal', 'close'])

    const help = String(log.mock.calls[0]?.[0])
    expect(help).toContain('orca terminal close [--terminal <handle>] [--tab] [--json]')
    expect(help).toContain('durable persistence')
  })
})

describe('terminal send CLI', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('routes agent prompts through the atomic prompt RPC', async () => {
    const parsed = parseArgs([
      'terminal',
      'send',
      '--terminal',
      'term-1',
      '--text',
      'continue',
      '--agent-prompt'
    ])
    const call = vi.fn().mockResolvedValue({
      result: { send: { handle: 'term-1', accepted: true, bytesWritten: 23 } }
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await TERMINAL_HANDLERS['terminal send']({
      flags: parsed.flags,
      client: { call } as unknown as RuntimeClient,
      cwd: '/tmp/worktree',
      json: true
    })

    expect(call).toHaveBeenCalledWith('terminal.sendAgentPrompt', {
      terminal: 'term-1',
      text: 'continue',
      client: { id: 'orca-cli', type: 'desktop' }
    })
  })

  it('rejects raw submit controls with an atomic agent prompt', async () => {
    const parsed = parseArgs([
      'terminal',
      'send',
      '--terminal',
      'term-1',
      '--text',
      'continue',
      '--agent-prompt',
      '--enter'
    ])
    const call = vi.fn()

    await expect(
      TERMINAL_HANDLERS['terminal send']({
        flags: parsed.flags,
        client: { call } as unknown as RuntimeClient,
        cwd: '/tmp/worktree',
        json: true
      })
    ).rejects.toThrow('--agent-prompt cannot be combined with --enter or --interrupt')
    expect(call).not.toHaveBeenCalled()
  })
})

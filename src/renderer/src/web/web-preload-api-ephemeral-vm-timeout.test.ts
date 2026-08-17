import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(new URL('./web-preload-api.ts', import.meta.url), 'utf8')

describe('web ephemeral VM provisioning timeout', () => {
  it('uses the long-operation timeout for provisioning', () => {
    expect(SOURCE).toContain('const EPHEMERAL_VM_PROVISION_TIMEOUT_MS = 10 * 60_000')
    expect(SOURCE).toMatch(/'ephemeralVm\.provision',\s*args,\s*EPHEMERAL_VM_PROVISION_TIMEOUT_MS/)
  })
})

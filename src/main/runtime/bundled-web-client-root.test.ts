import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveBundledWebClientRoot } from './bundled-web-client-root'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('bundled web client root', () => {
  it('prefers physical unpacked assets over the app.asar view', () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-web-root-'))
    roots.push(root)
    const resourcesPath = join(root, 'resources')
    const appPath = join(resourcesPath, 'app.asar')
    const unpackedWeb = join(resourcesPath, 'app.asar.unpacked', 'out', 'web')
    mkdirSync(unpackedWeb, { recursive: true })
    writeFileSync(join(unpackedWeb, 'web-index.html'), '<html></html>')

    expect(resolveBundledWebClientRoot({ appPath, resourcesPath })).toBe(unpackedWeb)
  })
})

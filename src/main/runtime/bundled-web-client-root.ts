import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function resolveBundledWebClientRoot(args: {
  appPath: string
  resourcesPath: string
}): string | undefined {
  const roots = [
    // Why: packaged web assets are unpacked. Reading through app.asar consults its stale file index,
    // which makes newly deployed hashed chunks return 404 even when they exist on disk.
    join(args.resourcesPath, 'app.asar.unpacked', 'out', 'web'),
    join(args.appPath, 'out', 'web'),
    // Why: unpacked electron-vite entrypoints set appPath to out/main, next to the web bundle.
    join(args.appPath, '..', 'web')
  ]
  return roots.find((root) => existsSync(join(root, 'web-index.html')))
}

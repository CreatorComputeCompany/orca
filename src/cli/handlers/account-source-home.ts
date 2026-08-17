import { RuntimeClientError } from '../runtime/types'

export function resolveCodexSourceHome(
  flags: ReadonlyMap<string, string | boolean>,
  agent: string
): string | null {
  const sourceHome = flags.get('source-home')
  if (sourceHome === undefined) {
    return null
  }
  if (agent !== 'codex') {
    throw new RuntimeClientError(
      'invalid_argument',
      '`--source-home` is only supported with `--agent codex`.'
    )
  }
  if (typeof sourceHome !== 'string') {
    throw new RuntimeClientError('invalid_argument', 'Missing a value for --source-home.')
  }
  return sourceHome
}

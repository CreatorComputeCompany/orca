export function shouldRestartRemoteSessionMirror(args: {
  previousTerminalCount: number
  terminalCount: number
}): boolean {
  return args.previousTerminalCount > 0 && args.terminalCount === 0
}

export class MobileRuntimeFederationOwnerIndex {
  private readonly worktrees = new Map<string, string>()
  private readonly terminals = new Map<string, string>()

  clearWorktrees(deviceId: string): void {
    const prefix = `${deviceId}:`
    for (const key of this.worktrees.keys()) {
      if (key.startsWith(prefix)) {
        this.worktrees.delete(key)
      }
    }
  }

  clearEnvironment(deviceId: string, environmentId: string): void {
    const prefix = `${deviceId}:`
    for (const [key, ownerEnvironmentId] of this.worktrees) {
      if (key.startsWith(prefix) && ownerEnvironmentId === environmentId) {
        this.worktrees.delete(key)
      }
    }
    for (const [key, ownerEnvironmentId] of this.terminals) {
      if (key.startsWith(prefix) && ownerEnvironmentId === environmentId) {
        this.terminals.delete(key)
      }
    }
  }

  setWorktree(deviceId: string, worktreeId: string, environmentId: string): void {
    this.worktrees.set(this.key(deviceId, worktreeId), environmentId)
  }

  setTerminal(deviceId: string, terminalId: string, environmentId: string): void {
    this.terminals.set(this.key(deviceId, terminalId), environmentId)
  }

  resolveWorktree(deviceId: string, worktreeId: string): string | null {
    return this.worktrees.get(this.key(deviceId, worktreeId)) ?? null
  }

  resolveTerminal(deviceId: string, terminalId: string): string | null {
    return this.terminals.get(this.key(deviceId, terminalId)) ?? null
  }

  private key(deviceId: string, resourceId: string): string {
    return `${deviceId}:${resourceId}`
  }
}

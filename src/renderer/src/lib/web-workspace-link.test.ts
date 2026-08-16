import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../../shared/worktree/types'
import {
  createWebWorkspaceLink,
  findWorktreeForWebWorkspaceReference,
  readWebWorkspaceReference
} from './web-workspace-link'

describe('web workspace links', () => {
  it('creates a credential-free controller URL', () => {
    expect(
      createWebWorkspaceLink(
        { origin: 'https://orca.example', pathname: '/web-index.html' },
        'runtime-123'
      )
    ).toBe('https://orca.example/web-index.html?workspace=runtime-123')
  })

  it('reads only bounded opaque workspace references', () => {
    expect(readWebWorkspaceReference({ search: '?workspace=runtime-123' })).toBe('runtime-123')
    expect(readWebWorkspaceReference({ search: '?workspace=%2Fhome%2Fboxd' })).toBeNull()
    expect(readWebWorkspaceReference({ search: '?workspace=' })).toBeNull()
  })

  it('resolves the viewer-specific worktree through its shared runtime identity', () => {
    const worktrees = [
      { id: 'viewer-specific-id', runtimeOwnerEnvironmentId: 'runtime-123' }
    ] as Worktree[]
    expect(findWorktreeForWebWorkspaceReference(worktrees, 'runtime-123')?.id).toBe(
      'viewer-specific-id'
    )
    expect(findWorktreeForWebWorkspaceReference(worktrees, 'private-runtime')).toBeNull()
  })
})

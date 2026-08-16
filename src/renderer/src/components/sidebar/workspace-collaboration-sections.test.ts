import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import { getWorkspaceCollaborationSection } from './workspace-collaboration-sections'
import { buildRows } from './worktree-list-groups'
import { repo, worktree } from './worktree-list-groups-test-fixtures'

const base = { id: 'workspace', repoId: 'repo' } as Worktree
const currentDeviceIds = new Set(['jake-device'])

describe('getWorkspaceCollaborationSection', () => {
  it('separates private creator workspaces from shared workspaces', () => {
    expect(
      getWorkspaceCollaborationSection(
        {
          ...base,
          ephemeralVmSharing: 'private',
          creatorProvenance: { kind: 'paired-device', deviceId: 'jake-device' }
        },
        currentDeviceIds
      )
    ).toBe('mine')
    expect(
      getWorkspaceCollaborationSection(
        {
          ...base,
          ephemeralVmSharing: 'private',
          creatorProvenance: { kind: 'paired-device', deviceId: 'niall-device' }
        },
        currentDeviceIds
      )
    ).toBe('teammate')
    expect(
      getWorkspaceCollaborationSection({ ...base, ephemeralVmSharing: 'shared' }, currentDeviceIds)
    ).toBe('shared')
  })

  it('leaves ordinary and legacy workspaces in their existing project position', () => {
    expect(getWorkspaceCollaborationSection(base, currentDeviceIds)).toBeNull()
    expect(
      getWorkspaceCollaborationSection({ ...base, ephemeralVmSharing: 'private' }, currentDeviceIds)
    ).toBeNull()
  })

  it('builds collapsible Mine and Shared sections inside a project', () => {
    const mine: Worktree = {
      ...worktree,
      id: 'mine',
      ephemeralVmSharing: 'private',
      creatorProvenance: { kind: 'paired-device', deviceId: 'jake-device' }
    }
    const shared: Worktree = {
      ...worktree,
      id: 'shared',
      ephemeralVmSharing: 'shared',
      creatorProvenance: { kind: 'paired-device', deviceId: 'jake-device' }
    }
    const rows = buildRows(
      'repo',
      [mine, shared],
      new Map([[repo.id, repo]]),
      null,
      new Set(),
      undefined,
      undefined,
      undefined,
      {},
      new Map([
        [mine.id, mine],
        [shared.id, shared]
      ]),
      false,
      undefined,
      [],
      new Set(),
      new Map(),
      new Map(),
      [],
      undefined,
      [],
      undefined,
      undefined,
      undefined,
      currentDeviceIds
    )

    expect(
      rows.flatMap((row) =>
        row.type === 'header' ? [row.label] : row.type === 'item' ? [row.worktree.id] : []
      )
    ).toEqual([repo.displayName, 'Mine', 'mine', 'Shared', 'shared'])
  })
})

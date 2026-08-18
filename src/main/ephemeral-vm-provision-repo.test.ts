import { describe, expect, it } from 'vitest'
import type { Repo } from '../shared/repo-types'
import type { Store } from './persistence'
import { resolveEphemeralVmProvisionRepo } from './ephemeral-vm-provision-repo'

describe('resolveEphemeralVmProvisionRepo', () => {
  it('keeps an exact current repository id', () => {
    const current = makeRepo('current', 'CreatorComputeCompany/emma')
    const result = resolveEphemeralVmProvisionRepo(makeStore([current]), {
      repoId: current.id,
      projectId: 'github:creatorcomputecompany/emma'
    })

    expect(result).toMatchObject({ ok: true, repo: { id: current.id } })
  })

  it('recovers a stale browser repository id through the stable project identity', () => {
    const current = makeRepo('current', 'CreatorComputeCompany/list-engine')
    const result = resolveEphemeralVmProvisionRepo(makeStore([current]), {
      repoId: 'stale-browser-id',
      projectId: 'github:creatorcomputecompany/list-engine'
    })

    expect(result).toMatchObject({ ok: true, repo: { id: current.id } })
  })

  it('fails closed when the stable identity is ambiguous', () => {
    const first = makeRepo('first', 'CreatorComputeCompany/emma')
    const second = makeRepo('second', 'CreatorComputeCompany/emma')
    const result = resolveEphemeralVmProvisionRepo(makeStore([first, second]), {
      repoId: 'stale-browser-id',
      projectId: 'github:creatorcomputecompany/emma'
    })

    expect(result).toMatchObject({ ok: false, message: 'Repo not found: stale-browser-id' })
  })
})

function makeRepo(id: string, fullName: string): Repo {
  return {
    id,
    path: `/repos/${id}`,
    displayName: id,
    badgeColor: '#737373',
    addedAt: 1,
    kind: 'git',
    gitRemoteIdentity: {
      canonicalKey: `github.com/${fullName}`,
      remoteName: 'origin',
      remoteUrl: `https://github.com/${fullName}.git`
    }
  }
}

function makeStore(repos: Repo[]): Store {
  return {
    getRepo: (id: string) => repos.find((repo) => repo.id === id),
    getRepos: () => repos,
    getProjects: () => []
  } as unknown as Store
}

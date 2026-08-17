import { describe, expect, it } from 'vitest'
import {
  buildGsdLaunchPrompt,
  isGsdIdentityLinkRequired,
  resolveGsdControllerRepoId,
  shouldAutoCreateGsdWorkspace,
  shouldConsumePendingGsdLaunch
} from './gsd-orca-launch'
import type { GsdOrcaLaunchConsumeResult } from '../../../shared/gsd-orca-launch-contract'
import type { Repo } from '../../../shared/repo-types'

describe('GSD Orca launch errors', () => {
  it('recognizes the one-time account-link requirement', () => {
    expect(
      isGsdIdentityLinkRequired(
        new Error('Link this Orca member to GSD before opening card worktrees.')
      )
    ).toBe(true)
    expect(isGsdIdentityLinkRequired(new Error('GSD rejected this launch.'))).toBe(false)
    expect(isGsdIdentityLinkRequired('Link this Orca member to GSD')).toBe(false)
  })

  it('waits for app hydration before consuming the pending launch', () => {
    expect(
      shouldConsumePendingGsdLaunch({
        hasMultiplayerAccount: true,
        hasPendingLaunch: true,
        appHydrated: false,
        alreadyStarted: false
      })
    ).toBe(false)
    expect(
      shouldConsumePendingGsdLaunch({
        hasMultiplayerAccount: true,
        hasPendingLaunch: true,
        appHydrated: true,
        alreadyStarted: false
      })
    ).toBe(true)
  })
})

describe('GSD agent prompt', () => {
  const launch: GsdOrcaLaunchConsumeResult = {
    runPublicId: 'run-1',
    cardPublicId: 'card-1',
    title: 'Reroute messages that bypass head.',
    description: '<p></p>',
    boardName: "Jake's Tasks",
    listName: 'Backlog',
    cardUrl: 'https://gsd.example.com/cards/card-1',
    repository: { name: 'emma', remoteUrl: 'https://github.com/example/emma.git' },
    agent: 'codex'
  }

  it('includes task context while dropping an empty rich-text description', () => {
    expect(buildGsdLaunchPrompt(launch)).toBe(
      [
        '# Reroute messages that bypass head.',
        'GSD card: https://gsd.example.com/cards/card-1',
        "Board: Jake's Tasks",
        'List: Backlog'
      ].join('\n\n')
    )
  })

  it('keeps a meaningful card description', () => {
    expect(
      buildGsdLaunchPrompt({ ...launch, description: '<p>Preserve the head route.</p>' })
    ).toContain('<p>Preserve the head route.</p>')
  })
})

describe('GSD controller repository resolution', () => {
  const repo = (overrides: Partial<Repo> & Pick<Repo, 'id'>): Repo => ({
    path: `/workspace/${overrides.id}`,
    displayName: overrides.id,
    badgeColor: '#000000',
    addedAt: 1,
    ...overrides
  })

  it('matches the requested remote only against controller-owned repos', () => {
    expect(
      resolveGsdControllerRepoId({
        repos: [
          repo({
            id: 'child-emma',
            executionHostId: 'runtime:child',
            gitRemoteIdentity: {
              canonicalKey: 'github.com/creatorcomputecompany/emma',
              remoteName: 'origin',
              remoteUrl: 'git@github.com:CreatorComputeCompany/emma.git'
            }
          }),
          repo({
            id: 'controller-emma',
            executionHostId: 'runtime:controller',
            gitRemoteIdentity: {
              canonicalKey: 'github.com/creatorcomputecompany/emma',
              remoteName: 'origin',
              remoteUrl: 'https://github.com/CreatorComputeCompany/emma.git'
            }
          })
        ],
        controllerEnvironmentId: 'controller',
        repositoryRemoteUrl: 'git@github.com:CreatorComputeCompany/emma.git'
      })
    ).toBe('controller-emma')
  })

  it('fails closed instead of falling back to an unrelated controller repo', () => {
    expect(
      resolveGsdControllerRepoId({
        repos: [repo({ id: 'controller-other', executionHostId: 'runtime:controller' })],
        controllerEnvironmentId: 'controller',
        repositoryRemoteUrl: 'https://github.com/CreatorComputeCompany/emma.git'
      })
    ).toBeNull()
  })
})

describe('GSD automatic workspace creation', () => {
  it('waits for the requested agent and Boxd recipe before submitting', () => {
    const base = {
      autoCreate: true,
      alreadyStarted: false,
      createDisabled: false,
      initialAgent: 'codex' as const,
      initialRecipeId: 'boxd-fork'
    }
    expect(
      shouldAutoCreateGsdWorkspace({
        ...base,
        selectedAgent: 'codex',
        selectedRecipeId: null
      })
    ).toBe(false)
    expect(
      shouldAutoCreateGsdWorkspace({
        ...base,
        selectedAgent: 'codex',
        selectedRecipeId: 'boxd-fork'
      })
    ).toBe(true)
    expect(
      shouldAutoCreateGsdWorkspace({
        ...base,
        selectedAgent: 'claude',
        selectedRecipeId: 'boxd-fork'
      })
    ).toBe(false)
  })
})

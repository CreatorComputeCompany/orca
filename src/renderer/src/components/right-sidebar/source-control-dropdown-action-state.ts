// Why: one derived snapshot every dropdown row reads, so the row builders never re-derive (or disagree about) upstream/PR blockers.

import type { DropdownActionInputs } from './source-control-dropdown-item-types'
import { canSubmitCommit, resolveCommitDisabledReason } from './source-control-commit-eligibility'
import type { GitConflictOperation } from '../../../../shared/git-status-types'
import { shouldForcePushWithLeaseForUpstream } from '../../../../shared/git-upstream-status'

export type DropdownActionState = {
  conflictOperation: GitConflictOperation
  hasCurrentBranch: boolean
  canPushLinkedReviewWithoutUpstream: boolean
  isPullRequestOperationActive: boolean
  hasDirtyLocalChanges: boolean
  upstreamLoading: boolean
  hasUpstream: boolean
  hasOpenHostedReview: boolean
  canPushUntrackedHostedReview: boolean
  pushBlockedByOpenHostedReviewTarget: boolean
  publishBlockedByMergedPR: boolean
  publishBlockedByPRLoading: boolean
  publishBlockedByOpenHostedReview: boolean
  publishBlockedByDetachedHead: boolean
  ahead: number
  behind: number
  shouldForcePushWithLease: boolean
  pushLabelCount: number
  globalBusy: boolean
  commitDisabledReason: string | null
  canCommit: boolean
}

export function resolveDropdownActionState(inputs: DropdownActionInputs): DropdownActionState {
  const {
    stagedCount,
    hasPartiallyStagedChanges,
    hasMessage,
    hasUnresolvedConflicts,
    isCommitting,
    isRemoteOperationActive,
    upstreamStatus,
    prState,
    isPRStateLoading,
    conflictOperation = 'unknown',
    branchCommitsAhead,
    hasCurrentBranch = true,
    canPushLinkedReviewWithoutUpstream = false,
    isPullRequestOperationActive = false
  } = inputs

  const hasStaged = stagedCount > 0
  const hasDirtyLocalChanges = hasStaged || inputs.hasUnstagedChanges
  // Why: undefined upstreamStatus means loading (transient after a worktree switch), not unpublished — treating it as hasUpstream=false would re-enable Publish Branch and clobber the real upstream.
  const upstreamLoading = upstreamStatus === undefined
  const hasUpstream = upstreamStatus?.hasUpstream ?? false
  const hasOpenHostedReview = prState === 'open' || prState === 'draft'
  const canPushUntrackedHostedReview =
    !hasUpstream &&
    hasOpenHostedReview &&
    hasCurrentBranch &&
    branchCommitsAhead !== 0 &&
    canPushLinkedReviewWithoutUpstream
  // Why: only a missing review head hard-blocks; branchCommitsAhead === 0 still means the target is known, so Push stays available.
  const pushBlockedByOpenHostedReviewTarget =
    !hasUpstream && hasOpenHostedReview && !canPushLinkedReviewWithoutUpstream
  const publishBlockedByMergedPR = !hasUpstream && prState === 'merged'
  const publishBlockedByPRLoading = !hasUpstream && !!isPRStateLoading
  const publishBlockedByOpenHostedReview = !hasUpstream && hasOpenHostedReview
  const publishBlockedByDetachedHead = !hasUpstream && !hasCurrentBranch
  const ahead = upstreamStatus?.ahead ?? 0
  const behind = upstreamStatus?.behind ?? 0
  const shouldForcePushWithLease = shouldForcePushWithLeaseForUpstream(upstreamStatus)
  // Why: prefer branch-compare for force-push counts — unpublished/loading branches report ahead=0 and patch-equivalent rewrites inflate upstream ahead.
  const pushLabelCount =
    branchCommitsAhead !== undefined &&
    branchCommitsAhead > 0 &&
    (shouldForcePushWithLease || !hasUpstream)
      ? branchCommitsAhead
      : ahead

  // Why: lock the whole menu during any in-flight op so a second click can't queue on a stale status snapshot.
  const globalBusy = isCommitting || isRemoteOperationActive || isPullRequestOperationActive

  const commitDisabledReason = resolveCommitDisabledReason({
    stagedCount,
    hasPartiallyStagedChanges,
    hasMessage,
    hasUnresolvedConflicts
  })
  const canCommit =
    !globalBusy &&
    canSubmitCommit({
      stagedCount,
      hasPartiallyStagedChanges,
      hasMessage,
      hasUnresolvedConflicts,
      isCommitting,
      isRemoteOperationActive,
      isPullRequestOperationActive
    })

  return {
    conflictOperation,
    hasCurrentBranch,
    canPushLinkedReviewWithoutUpstream,
    isPullRequestOperationActive,
    hasDirtyLocalChanges,
    upstreamLoading,
    hasUpstream,
    hasOpenHostedReview,
    canPushUntrackedHostedReview,
    pushBlockedByOpenHostedReviewTarget,
    publishBlockedByMergedPR,
    publishBlockedByPRLoading,
    publishBlockedByOpenHostedReview,
    publishBlockedByDetachedHead,
    ahead,
    behind,
    shouldForcePushWithLease,
    pushLabelCount,
    globalBusy,
    commitDisabledReason,
    canCommit
  }
}

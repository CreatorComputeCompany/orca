// Why: the three commit rows share one disabled ladder (commitDisabledReason) — keeping them together keeps that ladder in one place.

import type { DropdownItem } from './source-control-dropdown-item-types'
import type { DropdownActionState } from './source-control-dropdown-action-state'
import { translate } from '@/i18n/i18n'

export function resolveCommitDropdownItems(state: DropdownActionState): DropdownItem[] {
  const {
    upstreamLoading,
    hasUpstream,
    hasOpenHostedReview,
    canPushLinkedReviewWithoutUpstream,
    pushBlockedByOpenHostedReviewTarget,
    publishBlockedByMergedPR,
    publishBlockedByPRLoading,
    publishBlockedByDetachedHead,
    behind,
    shouldForcePushWithLease,
    globalBusy,
    commitDisabledReason,
    canCommit
  } = state

  const commitItem: DropdownItem = {
    kind: 'commit',
    label: translate(
      'auto.components.right.sidebar.source.control.dropdown.items.2b8e6595fd',
      'Commit'
    ),
    title: commitDisabledReason ?? 'Commit staged changes',
    disabled: !canCommit
  }

  // Why: compound commit labels omit counts — the commit itself changes ahead/behind, so pre-commit numbers would mislead.
  const commitPushTitle = upstreamLoading
    ? 'Checking branch status…'
    : publishBlockedByPRLoading
      ? 'Checking PR status…'
      : publishBlockedByMergedPR
        ? 'PR is already merged'
        : publishBlockedByDetachedHead
          ? 'Check out a branch before pushing commits'
          : pushBlockedByOpenHostedReviewTarget
            ? 'Linked review branch target is unavailable'
            : !hasUpstream && !(hasOpenHostedReview && canPushLinkedReviewWithoutUpstream)
              ? 'Publish the branch first to push commits'
              : (commitDisabledReason ??
                (shouldForcePushWithLease
                  ? 'Commit staged changes and force push with lease'
                  : behind > 0
                    ? 'Commit staged changes and try to push'
                    : 'Commit staged changes and push'))
  const commitPushItem: DropdownItem = {
    kind: 'commit_push',
    label: shouldForcePushWithLease ? 'Commit & Force Push' : 'Commit & Push',
    title: commitPushTitle,
    // Why: match explicit Push — only an open linked review with a known head can commit+push without a git upstream.
    disabled:
      globalBusy ||
      upstreamLoading ||
      (!hasUpstream && !(hasOpenHostedReview && canPushLinkedReviewWithoutUpstream)) ||
      publishBlockedByDetachedHead ||
      publishBlockedByPRLoading ||
      publishBlockedByMergedPR ||
      commitDisabledReason !== null
  }

  const commitSyncTitle = (() => {
    if (upstreamLoading) {
      return 'Checking branch status…'
    }
    if (publishBlockedByPRLoading) {
      return 'Checking PR status…'
    }
    if (publishBlockedByMergedPR) {
      return 'PR is already merged'
    }
    if (publishBlockedByDetachedHead) {
      return 'Check out a branch before syncing commits'
    }
    if (!hasUpstream) {
      // Why: direct the user to Publish Branch (the primary action) rather than naming a nonexistent compound action.
      return 'Publish the branch first to sync commits'
    }
    if (shouldForcePushWithLease) {
      return (
        commitDisabledReason ??
        'Use Commit & Force Push — remote only has older copies of local commits'
      )
    }
    return commitDisabledReason ?? 'Commit, then pull and push'
  })()
  const commitSyncItem: DropdownItem = {
    kind: 'commit_sync',
    label: translate(
      'auto.components.right.sidebar.source.control.dropdown.items.323bb614aa',
      'Commit & Sync'
    ),
    title: commitSyncTitle,
    disabled:
      globalBusy ||
      upstreamLoading ||
      !hasUpstream ||
      publishBlockedByDetachedHead ||
      shouldForcePushWithLease ||
      commitDisabledReason !== null
  }

  return [commitItem, commitPushItem, commitSyncItem]
}

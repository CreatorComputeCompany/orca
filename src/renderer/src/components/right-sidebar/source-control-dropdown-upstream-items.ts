// Why: the ahead/behind transfer rows all read the same force-with-lease + blocker ladder; outgoing and incoming stay split because the entry order interleaves review rows between them.

import type { DropdownActionInputs, DropdownItem } from './source-control-dropdown-item-types'
import type { DropdownActionState } from './source-control-dropdown-action-state'
import {
  describeFastForwardCount,
  describePullCount,
  describePushCount,
  describeSyncCounts,
  formatCountLabel,
  formatForcePushTitle,
  formatManualForcePushTitle,
  formatSyncLabel,
  formatUnpublishedForcePushTitle
} from './source-control-dropdown-item-copy'

export function resolvePushDropdownItems(
  inputs: DropdownActionInputs,
  state: DropdownActionState
): DropdownItem[] {
  const { upstreamStatus, branchCommitsAhead } = inputs
  const {
    upstreamLoading,
    hasUpstream,
    canPushUntrackedHostedReview,
    pushBlockedByOpenHostedReviewTarget,
    publishBlockedByDetachedHead,
    ahead,
    behind,
    shouldForcePushWithLease,
    pushLabelCount,
    globalBusy
  } = state
  const forcePushTitle = formatForcePushTitle(branchCommitsAhead, upstreamStatus?.upstreamName)

  const pushItem: DropdownItem = {
    kind: 'push',
    label: formatCountLabel('Push', ahead),
    title: publishBlockedByDetachedHead
      ? 'Check out a branch before pushing commits'
      : pushBlockedByOpenHostedReviewTarget
        ? 'Linked review branch target is unavailable'
        : upstreamLoading
          ? 'Push this branch and set an upstream if needed'
          : canPushUntrackedHostedReview
            ? 'Push updates to the linked review branch'
            : !hasUpstream
              ? 'Push this branch and set an upstream if needed'
              : shouldForcePushWithLease
                ? 'Try a regular push; git may require force push'
                : behind > 0 && ahead > 0
                  ? 'Push local commits; git may require syncing first'
                  : ahead === 0
                    ? `Nothing to push${upstreamStatus?.upstreamName ? ` to ${upstreamStatus.upstreamName}` : ''}`
                    : describePushCount(ahead),
    // Why: Push stays available without an upstream (git resolves --set-upstream) and under force-with-lease; only detached HEAD and unknown review targets block.
    disabled: globalBusy || publishBlockedByDetachedHead || pushBlockedByOpenHostedReviewTarget
  }

  const forcePushItem: DropdownItem = {
    kind: 'force_push',
    label: formatCountLabel('Force Push', pushLabelCount),
    title: publishBlockedByDetachedHead
      ? 'Check out a branch before force pushing commits'
      : pushBlockedByOpenHostedReviewTarget
        ? 'Linked review branch target is unavailable'
        : upstreamLoading
          ? formatUnpublishedForcePushTitle(branchCommitsAhead)
          : !hasUpstream
            ? formatUnpublishedForcePushTitle(branchCommitsAhead)
            : pushLabelCount === 0
              ? `Nothing to force push${upstreamStatus?.upstreamName ? ` to ${upstreamStatus.upstreamName}` : ''}`
              : shouldForcePushWithLease
                ? forcePushTitle
                : formatManualForcePushTitle(pushLabelCount, behind, upstreamStatus?.upstreamName),
    // Why: same target-safety gate as Push — force-with-lease to a wrong review head is worse than blocking; stays available without an upstream.
    disabled: globalBusy || publishBlockedByDetachedHead || pushBlockedByOpenHostedReviewTarget
  }

  return [pushItem, forcePushItem]
}

export function resolveIncomingDropdownItems(state: DropdownActionState): DropdownItem[] {
  const {
    upstreamLoading,
    hasUpstream,
    publishBlockedByMergedPR,
    publishBlockedByPRLoading,
    publishBlockedByDetachedHead,
    ahead,
    behind,
    shouldForcePushWithLease,
    globalBusy
  } = state

  const pullItem: DropdownItem = {
    kind: 'pull',
    label: formatCountLabel('Pull', behind),
    title: upstreamLoading
      ? 'Checking branch status…'
      : publishBlockedByPRLoading
        ? 'Checking PR status…'
        : publishBlockedByMergedPR
          ? 'PR is already merged'
          : publishBlockedByDetachedHead
            ? 'Check out a branch before pulling commits'
            : !hasUpstream
              ? 'Publish the branch first to pull commits'
              : shouldForcePushWithLease
                ? 'Nothing new to pull — remote only has older copies of local commits'
                : behind === 0
                  ? 'Nothing to pull'
                  : describePullCount(behind),
    disabled: globalBusy || upstreamLoading || !hasUpstream || publishBlockedByDetachedHead
  }

  const fastForwardItem: DropdownItem = {
    kind: 'fast_forward',
    label: formatCountLabel('Fast-forward', behind),
    title: upstreamLoading
      ? 'Checking branch status…'
      : publishBlockedByPRLoading
        ? 'Checking PR status…'
        : publishBlockedByMergedPR
          ? 'PR is already merged'
          : publishBlockedByDetachedHead
            ? 'Check out a branch before fast-forwarding'
            : !hasUpstream
              ? 'Publish the branch first to fast-forward'
              : shouldForcePushWithLease
                ? 'Nothing new to fast-forward — remote only has older copies of local commits'
                : behind === 0
                  ? 'Nothing to fast-forward'
                  : ahead > 0
                    ? 'Try a fast-forward pull; git may reject local commits'
                    : describeFastForwardCount(behind),
    disabled: globalBusy || upstreamLoading || !hasUpstream || publishBlockedByDetachedHead
  }

  const syncItem: DropdownItem = {
    kind: 'sync',
    label: formatSyncLabel('Sync', ahead, behind),
    title: upstreamLoading
      ? 'Checking branch status…'
      : publishBlockedByPRLoading
        ? 'Checking PR status…'
        : publishBlockedByMergedPR
          ? 'PR is already merged'
          : publishBlockedByDetachedHead
            ? 'Check out a branch before syncing commits'
            : !hasUpstream
              ? 'Publish the branch first to sync commits'
              : shouldForcePushWithLease
                ? 'Use Force Push — remote only has older copies of local commits'
                : ahead === 0 && behind === 0
                  ? 'Branch is up to date'
                  : describeSyncCounts(ahead, behind),
    disabled:
      globalBusy ||
      upstreamLoading ||
      !hasUpstream ||
      publishBlockedByDetachedHead ||
      shouldForcePushWithLease
  }

  return [pullItem, fastForwardItem, syncItem]
}

// Why: branch-level rows read no ahead/behind counts, so they stay clear of the transfer-row ladders.

import type { DropdownActionInputs, DropdownItem } from './source-control-dropdown-item-types'
import type { DropdownActionState } from './source-control-dropdown-action-state'
import { formatRebaseBaseRef } from './source-control-dropdown-item-copy'
import { translate } from '@/i18n/i18n'

export function resolveBranchDropdownItems(
  inputs: DropdownActionInputs,
  state: DropdownActionState
): DropdownItem[] {
  const { rebaseBaseRef } = inputs
  const {
    hasDirtyLocalChanges,
    upstreamLoading,
    hasUpstream,
    canPushLinkedReviewWithoutUpstream,
    publishBlockedByMergedPR,
    publishBlockedByPRLoading,
    publishBlockedByOpenHostedReview,
    publishBlockedByDetachedHead,
    globalBusy
  } = state

  const rebaseBaseLabel = rebaseBaseRef ? formatRebaseBaseRef(rebaseBaseRef) : null
  const hasRemoteBaseRef = rebaseBaseLabel?.includes('/') === true
  const rebaseItem: DropdownItem = {
    kind: 'rebase_base',
    label: rebaseBaseLabel ? `Rebase from ${rebaseBaseLabel}` : 'Rebase from Base',
    title: (() => {
      if (!rebaseBaseLabel || !hasRemoteBaseRef) {
        return 'Choose a remote base branch to rebase from'
      }
      if (hasDirtyLocalChanges) {
        return 'Try rebasing; git may require committing or stashing local changes first'
      }
      return `Rebase current branch with latest commits from ${rebaseBaseLabel}`
    })(),
    disabled: globalBusy || !rebaseBaseRef || !hasRemoteBaseRef
  }

  const fetchItem: DropdownItem = {
    kind: 'fetch',
    label: translate(
      'auto.components.right.sidebar.source.control.dropdown.items.226b85a3a7',
      'Fetch'
    ),
    title: translate(
      'auto.components.right.sidebar.source.control.dropdown.items.04d709801d',
      'Fetch from remote without merging'
    ),
    disabled: globalBusy
  }

  const publishItem: DropdownItem = {
    kind: 'publish',
    label:
      publishBlockedByMergedPR || publishBlockedByPRLoading
        ? 'PR Status'
        : publishBlockedByOpenHostedReview
          ? 'Linked Review'
          : publishBlockedByDetachedHead
            ? 'No Branch'
            : 'Publish Branch',
    title: upstreamLoading
      ? 'Checking branch status…'
      : publishBlockedByPRLoading
        ? 'Checking PR status…'
        : publishBlockedByMergedPR
          ? 'PR is already merged'
          : publishBlockedByOpenHostedReview
            ? canPushLinkedReviewWithoutUpstream
              ? 'Linked review branch already exists'
              : 'Linked review branch target is unavailable'
            : publishBlockedByDetachedHead
              ? 'Check out a branch before publishing commits'
              : hasUpstream
                ? 'Branch is already published'
                : 'Publish this branch to origin',
    disabled:
      globalBusy ||
      upstreamLoading ||
      hasUpstream ||
      publishBlockedByPRLoading ||
      publishBlockedByMergedPR ||
      publishBlockedByOpenHostedReview ||
      publishBlockedByDetachedHead
  }

  return [rebaseItem, fetchItem, publishItem]
}

// Why: split from source-control-primary-action — primary and dropdown are independent derivations with different priority ladders.

import type { DropdownActionInputs, DropdownEntry } from './source-control-dropdown-item-types'
import { resolveDropdownActionState } from './source-control-dropdown-action-state'
import { resolveCommitDropdownItems } from './source-control-dropdown-commit-items'
import {
  resolveIncomingDropdownItems,
  resolvePushDropdownItems
} from './source-control-dropdown-upstream-items'
import { resolveHostedReviewDropdownItems } from './source-control-dropdown-hosted-review-items'
import { resolveBranchDropdownItems } from './source-control-dropdown-branch-items'
import { translate } from '@/i18n/i18n'

/**
 * Resolve the chevron dropdown items. Every row is always rendered — disabled with a
 * tooltip reason rather than hidden — so the menu shape stays stable across states.
 */
export function resolveDropdownItems(inputs: DropdownActionInputs): DropdownEntry[] {
  const state = resolveDropdownActionState(inputs)
  const { conflictOperation, isPullRequestOperationActive, globalBusy } = state

  const entries: DropdownEntry[] = [
    ...resolveCommitDropdownItems(state),
    { kind: 'separator' },
    ...resolvePushDropdownItems(inputs, state),
    ...resolveHostedReviewDropdownItems(inputs, state),
    ...resolveIncomingDropdownItems(state),
    ...resolveBranchDropdownItems(inputs, state)
  ]
  if (conflictOperation === 'merge' || conflictOperation === 'rebase') {
    const isRebase = conflictOperation === 'rebase'
    const label = isRebase ? 'Abort rebase' : 'Abort merge'
    entries.push(
      { kind: 'separator' },
      {
        kind: isRebase ? 'abort_rebase' : 'abort_merge',
        label,
        title: globalBusy ? 'Operation in progress…' : `Abort the ${conflictOperation} in progress`,
        disabled: globalBusy,
        variant: 'destructive'
      }
    )
  }
  if (!isPullRequestOperationActive) {
    return entries
  }
  return entries.map((entry) =>
    entry.kind === 'separator'
      ? entry
      : {
          ...entry,
          title: translate(
            'auto.components.right.sidebar.source.control.dropdown.items.7aad2c0240',
            'Hosted review operation in progress…'
          ),
          disabled: true
        }
  )
}

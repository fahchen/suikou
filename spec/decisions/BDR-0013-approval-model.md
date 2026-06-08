---
id: BDR-0013
title: Approval model — verdict-based, latest-only, reversible, approve-only
status: accepted
date: 2026-06-07
summary: Approval is a review submitted with verdict approve on the latest round; the reviewer can dismiss it, submitting a later round supersedes it, and approve is the only terminal disposition
---

## Scope

**Feature**: domains/review/features/review.feature
**Rule**: Submitting a later round after approval clears approval

## Context

Approval is the terminal signal of the review loop. Suikou expresses it as a
review verdict ([[BDR-0015-review-batch-and-verdict]]) rather than a standalone
action. We still had to define what it attaches to, whether it can be undone,
what happens when the reviewer reviews a revision of an approved artifact, and
whether a symmetric reject state exists.

## Decision

### What it attaches to
Approval is a review submitted with verdict `approve`. It attaches to a specific
round, and only the **latest** round is reviewable — the reviewer reviews the
version currently in front of them. The approved round number is recorded.
Superseded older rounds cannot be reviewed or approved.

### Reversibility
Approval is reversible: the reviewer can dismiss the approval and reopen the
review at any time, with no agent involvement. A mistaken or reconsidered
approval is recoverable.

### Reviewing a revision after approval
Approval never closes the door on further iteration. The agent edits the file on
disk; when the reviewer re-snapshots and submits a later round, the approval is
cleared and the review continues
([[BDR-0018-project-boards-and-human-controlled-rounds]]). Approval is
superseded, not a barrier — the human owns round advancement and review state.

### Approve-only terminal
The only terminal disposition is the `approve` verdict. Absence of an approve
verdict means still in review. There is no separate reject state; a `request_changes`
verdict carrying `fix_required` critique conveys rejection and stays actionable —
the agent addresses it in a new round.

## Rejected Alternatives

- **Approve any round**: approving a superseded older round is ambiguous — it is
  unclear what "this old version is accepted" means once a newer round exists.
  Restricting to the latest round keeps approval meaning "the current artifact is
  good."
- **Irreversible approval**: would force a reviewer who approved by mistake to
  drive a content change just to clear it; dismissing the approval is simpler and
  safer.
- **Approval as a hard close**: would force a brand-new artifact to make any
  further change. Reopening when the reviewer submits a later round keeps
  iteration possible after a premature approval.
- **Separate reject verdict/state**: a terminal reject adds a second terminal
  concept the MVP does not need — a `request_changes` verdict with `fix_required`
  comments already conveys rejection, and it stays actionable (the agent can
  iterate) rather than dead-end.

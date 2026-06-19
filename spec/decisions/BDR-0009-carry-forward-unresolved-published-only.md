---
id: BDR-0009
title: Only unresolved published critique carries forward to a new round
status: superseded
superseded_by: BDR-0023
date: 2026-06-06
summary: When a round advances, unresolved published comments re-anchor onto the new round; resolved comments stay on their round and pending comments never carry
---

> **Superseded by [BDR-0023](BDR-0023-single-row-comment-across-rounds.md).**
> Open feedback still reaches later rounds, but a comment is now one row whose
> per-round visibility is derived from `authored_round` and `resolved_round`;
> nothing is copied or re-anchored onto a new round. The "resolved stays put,
> pending never reaches the agent" intent below still holds — a resolved comment
> drops out of later rounds when its `resolved_round` truncates the range, and a
> pending comment is invisible until submitted.

## Scope

**Feature**: domains/critique/features/carry-forward.feature
**Rule**: Unresolved published comments carry forward to the new round

## Context

A round advances when the reviewer submits it
([[BDR-0018-project-boards-and-human-controlled-rounds]]). The reviewer's open
feedback must survive into the next round, or every round would start from a
blank critique slate and unaddressed points would be silently lost. We had to
decide which comments follow the artifact into the new round.

## Behaviours Considered

### Option A: Only unresolved published comments carry
Published comments that are not yet resolved re-anchor onto the new round.
Resolved comments stay on their original round as history. Pending (unpublished)
comments never carry — they stay on their round and remain editable.

### Option B: All published comments carry
Every published comment, resolved or not, is carried onto the new round.

### Option C: Nothing carries
Each round's comments belong to that round only; the reviewer re-comments from
scratch on each round.

## Decision

Option A. Carry-forward exists to keep open feedback in front of the reviewer
across revisions. A resolved comment has done its job, so re-presenting it on the
new round only adds noise; it stays where it was resolved. A pending comment is
not yet feedback the agent should see, so it cannot carry (consistent with
submit-review, [[BDR-0008-submit-review-publishes-critique]]). Unresolved
published comments are exactly the open items, so those carry.

## Rejected Alternatives

- **All published carry (B)**: drags resolved items onto every subsequent round,
  cluttering the new round with already-handled feedback.
- **Nothing carries (C)**: forces the reviewer to manually re-enter every still-
  open point after each agent revision, which is the precise toil carry-forward
  removes.

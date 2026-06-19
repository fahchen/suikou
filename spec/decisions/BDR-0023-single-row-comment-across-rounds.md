---
id: BDR-0023
title: A comment is one row across all rounds, with per-round visibility derived from its rounds
status: accepted
date: 2026-06-19
summary: A comment is a single row that lives across every round; its per-round visibility is derived from `authored_round` and `resolved_round` rather than copied into a new per-round row, so its thread and replies stay attached to one identity
supersedes: BDR-0009, BDR-0011
---

## Scope

**Feature**: domains/critique/features/carry-forward.feature, domains/critique/features/lifecycle.feature, domains/critique/features/discussion.feature
**Rule**: A comment is one row whose visibility spans the rounds it is open on

## Context

[[BDR-0009-carry-forward-unresolved-published-only]] kept open feedback in front
of the reviewer across revisions, and [[BDR-0011-lineage-new-row-per-round]]
implemented that by copying each unresolved published comment into a brand-new
row on the next round, linked back to its origin. Each advance minted a fresh row
with a fresh identity.

That copy model broke agent consumption. The agent CLI polls the latest round's
critique; because every advance produced a new row with no replies, a comment the
agent had already answered re-surfaced as a never-seen item on the next round. The
agent could not tell "already addressed" from "new", so `poll` re-returned handled
feedback round after round. The thread — the agent's own replies — stayed stranded
on the previous round's row.

We had to decide whether a comment that spans rounds is many copied rows or one
durable row.

## Behaviours Considered

### Option A: One row across all rounds, visibility derived (chosen)
A comment is a single row. It is created on the round in front of the reviewer
(`authored_round`) and, once resolved, records the round it was resolved at
(`resolved_round`). Its per-round visibility is *derived*, not stored: the comment
is visible on round N when

    authored_round <= N AND (resolved_round IS NULL OR resolved_round >= N)

Advancing a round copies nothing. The same row — with its replies — stays live on
every round it is open on.

### Option B: New row per round, linked to origin (the prior model)
Carrying forward mints a new row on the new round linked back to its origin; each
round keeps an immutable per-round snapshot of the comment.

## Decision

Option A. A comment is one piece of feedback with one identity, so it is one row.
Carry-forward stops being a copy step and becomes the absence of one: a still-open
comment is simply visible on later rounds because its derived visibility range
covers them. The thread travels with the comment because it never leaves the row
it was written on.

This directly fixes the poll regression: the agent sees one stable comment row
carrying its own replies, so "already answered" is readable from the row's last
published reply instead of being lost on a superseded copy.

Consequences:

- **`authored_round` replaces per-row origin lineage.** The round a comment was
  created on is denormalized onto the single row as the immutable `authored_round`.
  It is the provenance badge that [[BDR-0022-comment-location-model-refactor]]
  attributed to `original_round`; with one row there is no lineage chain to walk,
  so the origin link and the per-round `original_anchor` copy are gone.
- **Outdated is derived live, not frozen per round.** Whether a located comment's
  anchor still matches is computed by locating its quote in the current round's
  content (see [[BDR-0017-polymorphic-selector-anchor]]); it is not a stored
  per-row flag. Relocation re-captures the quote on the one row.
- **Resolution and reopening act on the one row.** Resolving sets `resolved_round`,
  which truncates the visibility range. Reopening clears it. Reopening happens only
  as a side effect of a human reply (see lifecycle), so the human always keeps the
  last word before the comment leaves the agent's view.

## Rejected Alternatives

- **New row per round (B)**: preserved a per-round history snapshot, but at the
  cost of fragmenting one comment's identity and thread across rounds. That
  fragmentation is exactly what made the agent re-handle resolved feedback and
  stranded replies on dead rows. The per-round history it bought was never read by
  any caller that the single-row model cannot reconstruct from `authored_round`,
  `resolved_round`, and the live snapshots.

## Supersedes

- [[BDR-0009-carry-forward-unresolved-published-only]] — open feedback still
  reaches later rounds, but by derived visibility of one row, not by copying
  unresolved published comments forward.
- [[BDR-0011-lineage-new-row-per-round]] — there is no per-round row and no origin
  link; a comment is one row whose visibility spans the rounds it is open on.

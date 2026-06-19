---
id: BDR-0011
title: Carried comments are new per-round rows linked to an origin
status: superseded
superseded_by: BDR-0023
date: 2026-06-06
summary: A carried-forward comment is a new row on the new round that links back to its origin, so each round keeps an immutable record of its critique
---

> **Superseded by [BDR-0023](BDR-0023-single-row-comment-across-rounds.md).** A
> comment is now one row across all rounds — no per-round copy and no origin link.
> The per-round-history goal below is reconstructed from the single row's
> `authored_round`, `resolved_round`, and the round snapshots rather than from
> stored per-round rows.

## Scope

**Feature**: domains/critique/features/carry-forward.feature
**Rule**: A carried comment is a new row linked to its origin

## Context

When an unresolved comment carries forward, the system must represent the same
piece of feedback existing across multiple rounds. We had to decide whether that
is one mutable record whose round pointer moves, or a new record per round.

## Behaviours Considered

### Option A: New row per round, linked to origin
Carrying forward creates a new comment row on the new round that links back to
its origin (the row on the previous round). Each round's row is an immutable
snapshot — its line anchor, outdated flag, and resolution at that round are fixed.
The live, actionable instance is the one on the latest round.

### Option B: Single row, moving round pointer
One comment record whose `round` field is updated each time it carries forward.

## Decision

Option A. Iteration is about seeing how review state evolved round to round. A new
row per round preserves what the comment looked like at each round — where it was
anchored, whether it was outdated, whether it was open — which is what round diff
(domains/reads/features/round-diff.feature) and history rendering need. Resolution is recorded on
the instance that was resolved, with
its `resolved_round`, while earlier rows stay as a faithful record that it was
open then.

## Rejected Alternatives

- **Single moving row (B)**: simpler storage, but it destroys per-round history —
  once the round pointer and line anchor move, there is no record of where the
  comment sat on the previous round, so a round diff cannot show that the comment
  was carried, nor reconstruct the earlier round's critique state.

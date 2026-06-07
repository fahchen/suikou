---
id: BDR-0014
title: Export is a read-only, self-contained snapshot of the latest round
status: accepted
date: 2026-06-06
summary: Export returns the latest round's complete published critique plus its snapshot and the latest verdict, read-only, rather than full cross-round history
---

## Scope

**Feature**: export/features/export.feature
**Rule**: Export returns the latest round's published critique

## Context

Export is the agent's read side of the loop. We had to decide how much it
returns (latest round vs all history), whether it carries the artifact content,
and whether reading it has side effects.

## Behaviours Considered

### Option A: Latest-round, self-contained, read-only
Export returns the latest round's complete published critique (including resolved
comments, for context, but never pending ones), the latest snapshot content, the
latest verdict, and thread replies. Reading it changes no state.

### Option B: Full cross-round history
Export returns every round's published critique with lineage, plus snapshots, so
the agent can reconstruct the entire review.

### Option C: Critique-only, metadata pull
Export returns critique and approval but not the snapshot; the agent reuses the
content it submitted.

## Decision

Option A. The agent acts on the current state of the review, so the latest round
is what it needs: the open and resolved comments on the version it last submitted,
with enough content to resolve line numbers and quotes, and the latest verdict so a
single pull answers "act, or done?". Including the snapshot makes the export
self-contained — the agent never has to correlate it against a separately held
copy. Reading is side-effect free, consistent with the submit-review lifecycle
([[BDR-0008-submit-review-publishes-critique]]), which already chose human
submit-review — not agent read — as what finalizes critique.

## Rejected Alternatives

- **Full history (B)**: larger payload dominated by cold, already-addressed
  rounds. Per-round history and lineage exist server-side for round diff and audit;
  the acting agent does not need them inlined on every pull.
- **Critique-only (C)**: forces the agent to re-associate critique with a content
  copy it must keep in sync, and breaks if its copy drifts from the stored
  snapshot. Self-containment is cheap for a single markdown artifact and removes a
  class of mismatch bugs.

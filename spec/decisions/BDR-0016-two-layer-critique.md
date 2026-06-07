---
id: BDR-0016
title: Two orthogonal layers — per-comment critique type and per-review verdict
status: accepted
date: 2026-06-07
summary: A comment keeps its per-item critique type (fix_required/needs_answer/note) while the review it belongs to carries a separate verdict; the two layers are orthogonal and the verdict is never gated by comment types
---

## Scope

**Feature**: critique/features/review.feature
**Rule**: An approve verdict is allowed with unresolved fix_required comments, with a warning

## Context

Adopting GitHub's review-with-verdict model ([[BDR-0015-review-batch-and-verdict]])
raised whether the per-comment critique type ([[BDR-0005-single-dimension-critique-type]])
should be dropped, since GitHub itself has no per-comment type. We had to decide
whether the verdict replaces the type or coexists with it.

## Behaviours Considered

### Option A: Keep both layers, orthogonal
Each comment keeps its critique type — `fix_required` / `needs_answer` / `note` —
which tells the agent what to do with *that item*. Each review carries a verdict —
`approve` / `request_changes` / `comment` — which states the *round's* overall
disposition. The two are independent: the verdict is the human's call and is never
blocked or overridden by the comment types it ships with.

### Option B: Verdict only (pure GitHub)
Drop per-comment type. The agent infers per-item action from the verdict plus the
freeform comment body.

## Decision

Option A. The verdict answers "what is the disposition of this round?"; the
critique type answers "what should the agent do with this specific comment?".
These are genuinely different questions, and the per-comment type is what makes
Suikou's critique machine-actionable item by item — the property that lets an
agent branch on `fix_required` vs `needs_answer` vs `note` without parsing prose.
The verdict adds a round-level summary on top; it does not subsume the per-item
signal.

The layers are orthogonal and the coupling is soft: a reviewer may submit an
`approve` verdict while `fix_required` comments are still open. The system warns
but does not block ([[BDR-0012-soft-approval-gate]]), because the human holds
final judgment and the comment type advises the agent rather than vetoing the
reviewer. In normal use `request_changes` accompanies open `fix_required` /
`needs_answer` items and `comment` accompanies only `note`s, but this is
convention, not an enforced constraint.

## Rejected Alternatives

- **Verdict only (B)**: throwing away per-comment type forces the agent back to
  reading prose to decide whether each comment must be fixed, answered, or merely
  noted — losing the item-level machine-readability that is the point of
  structured critique. The round-level verdict is too coarse to drive per-comment
  action.

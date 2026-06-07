---
id: BDR-0010
title: Re-anchor carried comments by exact quote match, mark outdated on failure
status: accepted
date: 2026-06-06
summary: A line-scoped comment relocates in the new snapshot only by an exact match of its captured quote; if the quote is gone the comment is kept and marked outdated rather than fuzzily relocated
---

## Scope

**Feature**: domains/critique/features/carry-forward.feature
**Rule**: A carried line-scoped comment re-anchors by exact quote match

## Context

When an unresolved line-scoped comment carries onto a new round, its stored line
range may no longer point at the same text, because the agent has edited the
content. The comment captured the quoted source text at creation (critique
feature) precisely so it can be relocated. We had to decide how to relocate it
and what to do when the quoted text is no longer present.

## Behaviours Considered

### Option A: Exact match, mark outdated on failure
Search the new snapshot for an exact occurrence of the captured quote. If found,
update the comment's line range to the new position. If not found, keep the
comment but mark it outdated (needs re-anchor) with no valid line anchor, for the
human to relocate.

### Option B: Fuzzy match
Use approximate matching (e.g. Levenshtein) to find the closest line and re-anchor
even when the text changed.

### Option C: Drop on failure
If the exact quote is gone, do not carry the comment at all.

## Decision

Option A. Exact matching is unambiguous: a relocated comment points at the same
text the reviewer saw, or it points at nothing and says so. When the quote is
gone the feedback is still valuable, so the comment is retained and surfaced as
outdated for the human to re-place, rather than guessed at or silently lost.

## Rejected Alternatives

- **Fuzzy match (B)**: can silently anchor a comment to text that is no longer
  what it was about, producing confidently wrong placement. The reviewer cannot
  tell a real match from a coincidental one.
- **Drop on failure (C)**: loses open feedback exactly when the content changed
  most — the case where the comment is most likely still relevant.

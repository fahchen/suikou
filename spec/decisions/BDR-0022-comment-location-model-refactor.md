---
id: BDR-0022
title: Comment location model refactor: attachment scope plus polymorphic anchor kind
status: accepted
date: 2026-06-13
summary: Comment scope is reduced to attachment level only; anchor kind lives entirely in the polymorphic `anchor` payload, `original_anchor` is removed because no caller reads it, and `original_round` stays as the frozen provenance badge
---

## Scope

**Feature**: domains/critique/features/authoring.feature, domains/critique/features/carry-forward.feature, domains/review/features/review.feature
**Rule**: A comment's attachment level and its selector kind are separate axes

## Context

[[BDR-0017-polymorphic-selector-anchor]] improved the location model by making a
located comment carry a typed selector (`line_range` now, `element` later). But
the current schema still leaves part of that meaning in `Comment.scope`: `:line`
means both "this comment is attached to a specific location" and, implicitly,
"that location is line-based". That was serviceable when `line_range` was the
only concrete anchor kind, but it becomes a mismatch as soon as
[[BDR-0020-git-diff-review-type]] adds `diff_hunk` and
[[BDR-0021-element-anchor-for-html-review]] adds `element`.

At the same time, [[BDR-0017-polymorphic-selector-anchor]] stored both a live
`anchor` and a frozen `original_anchor`. The current code path no longer reads
`original_anchor` when resolving or rendering comments; only `original_round`
still has an active caller as provenance for carried comments.

The model needs one cleanup pass before new anchor kinds land.

## Behaviours Considered

### Where anchor kind lives
- **A. Split the axes (chosen)**: `scope` says only what the comment is attached
  to; `anchor.__type__` says what kind of selector a located comment carries.
- **B. Keep encoding kind in `scope`**: add more scope variants such as
  `:diff_hunk` or `:element`.

### Original selector lineage
- **A. Keep `original_round`, drop `original_anchor` (chosen)**: retain the round
  provenance badge but remove the frozen selector copy with no readers.
- **B. Keep both frozen fields**: preserve `original_anchor` pre-emptively for
  future callers.

## Decision

### 1. `Comment.scope` becomes attachment-level only

`Comment.scope` is reduced to three values:

- `:review` — attached to the whole review
- `:artifact` — attached to an artifact but not a specific location
- `:located` — attached to a specific location within an artifact

This renames `:file` to `:artifact` and `:line` to `:located`.

The point is to separate two different questions. Scope answers "what object is
this comment attached to?" Anchor kind answers "if it is located, what kind of
selector locates it?" Those are orthogonal axes. Mixing them into one enum would
either multiply variants (`review`, `file`, `line`, `diff_hunk`, `element`, ...)
or keep requiring scope changes each time a new selector kind appears. Splitting
them keeps attachment policy stable while new anchor kinds remain additive.

### 2. Anchor kind moves entirely into `anchor.__type__`

`anchor` becomes the sole carrier of selector kind:

- `line_range`
- `diff_hunk` ([[BDR-0020-git-diff-review-type]])
- `element` ([[BDR-0021-element-anchor-for-html-review]])

A `:located` comment has a non-nil `anchor`; `:artifact` and `:review` comments
have `anchor = nil`. The store shape mirrors that same tagged-union design so
future anchor kinds append new variants rather than rewriting the existing model.

This completes the direction started by [[BDR-0017-polymorphic-selector-anchor]]:
the selector is polymorphic; the scope is not.

### 3. `original_anchor` is removed; `original_round` stays

`original_anchor` is dropped from the schema, storage, writes, and carry-forward
copy. `Critique.Anchor.resolve/2` reads only the live `anchor`, and there is no
current caller that reads `original_anchor` for display or relocation. Keeping a
field with zero readers is YAGNI, not foresight.

`original_round` remains. It still carries active provenance value: the UI uses
it as the frozen badge showing where a carried comment began, even when the live
anchor has moved or gone outdated.

### 4. The refactor is the shared prerequisite for new review types

[[BDR-0020-git-diff-review-type]] and [[BDR-0021-element-anchor-for-html-review]]
both depend on this split model. `diff_hunk` and `element` are new selector
kinds, not new attachment scopes, and they should land without another rewrite
of the comment scope enum or another duplicate "original" selector field.

## Rejected Alternatives

- **Encode selector kind in `scope` (B)**: couples attachment semantics to every
  future selector variant and turns an additive anchor change into a schema-wide
  scope change each time.
- **Keep `original_anchor` anyway (B)**: preserves dead state with no reader and
  invites future code to cargo-cult around a field the current design does not
  need.


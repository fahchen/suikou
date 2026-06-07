---
id: BDR-0017
title: Polymorphic selector anchor with diff-mapping re-anchor and original-anchor lineage
status: accepted
date: 2026-06-07
summary: A comment's location is a polymorphic selector (line-range now, HTML element later) stored as one embedded value; a carried comment re-anchors by mapping its line range through the round-to-round line diff, and each comment retains a frozen copy of its original anchor for outdated display
supersedes: BDR-0010
---

## Scope

**Feature**: domains/critique/features/authoring.feature, domains/critique/features/carry-forward.feature
**Rule**: A comment's location is a selector that can re-anchor across rounds

## Context

A line-scoped comment must point at a specific span of an artifact and follow
that span when the agent revises the content. BDR-0010 modelled this as a flat
line range plus a captured quote, relocated on a later round by an exact
whole-line match of the quote.

Two pressures push past that model:

1. **More than one source kind.** The artifact today is markdown, but the same
   review loop will anchor comments on plain text, code, and later rendered
   HTML. A line range fits text and code; HTML needs an element-level selector.
   The location must be polymorphic, not a fixed set of line columns.

2. **Re-anchoring precision.** Exact whole-line quote search relocates to the
   first textual occurrence, which mis-anchors when the same lines appear more
   than once, and discards a comment the moment its lines are edited even though
   the surrounding diff makes the move unambiguous. GitHub's review comments
   solve this by mapping the original line into the new diff rather than
   searching for the text.

## Decision

### 1. A comment's location is a polymorphic selector

The location is one embedded selector value, discriminated by type:

- `line_range` — `start_line`, `end_line`, and the captured `quote`. Used for
  text, markdown, and code.
- `element` (future) — an element-level selector for rendered HTML. Introduced
  only when an HTML caller exists; registering it adds no migration.

Whole-file and whole-review comments carry no selector (see the `scope` field:
`line` carries a selector, `file` and `review` do not).

Borrowed from the W3C Web Annotation selector idea (one target, a typed
selector), narrowed to the two kinds this product needs. Text-quote with
prefix/suffix context, character offsets, CSS/XPath/range selectors, and split
`side`/`start_side` diff anchors were all considered and rejected as more
machinery than the line-and-element model requires.

### 2. A carried `line_range` re-anchors by diff mapping

When an artifact advances, a carried comment re-anchors by mapping its line
range through the line-level difference between the previous and the new
snapshot:

- Every line in `start_line..end_line` that is unchanged maps to its new
  position; the comment's range moves to the mapped span.
- If any line in the range was changed or deleted, the comment is marked
  `outdated` (no valid anchor on the new round), retained for the human to
  relocate.

Mapping is chained round to round: each advance maps the previous round's live
range through that single diff, so position is tracked through the actual edits
rather than guessed from a global text search. The `quote` is retained for
display and for rendering an outdated comment against the text it was about.

### 3. Each comment keeps a frozen original anchor

Alongside the live `anchor`, a comment stores `original_anchor` and
`original_round`: the selector and round number at which the comment was first
authored. These are set once at creation and copied verbatim onto every carried
row, never re-mapped. They mirror GitHub's immutable `original_line` /
`original_commit_id`, so an outdated comment can always say where it began
without walking the origin lineage.

## Rejected Alternatives

- **Flat line columns (BDR-0010)**: cannot express an HTML element anchor; adding
  a source kind would mean new columns and a wider schema each time.
- **Exact whole-line quote search for re-anchoring**: relocates to the first
  matching occurrence (wrong under duplicate lines) and cannot distinguish a
  moved line from an edited one. Diff mapping tracks the specific instance.
- **Text-quote selector with prefix/suffix, character offsets, `side`/`start_side`,
  and stored diff hunks**: each adds machinery the line-and-element model does
  not need; rejected to keep the anchor small.
- **Original anchor by lineage walk only**: works but forces a query to the origin
  row for every outdated render; the frozen copy is three cheap fields.

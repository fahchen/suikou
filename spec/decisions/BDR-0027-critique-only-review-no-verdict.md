---
id: BDR-0027
title: A review is critique only — no verdict, no approval state
status: accepted
date: 2026-09-04
summary: Submitting a review publishes the review's pending critique and advances the round, carrying no verdict; approval, the per-file verdict chip, and the approved round are removed, and a file's disposition is read from its open comments
---

## Scope

**Feature**: domains/review/features/review.feature
**Rule**: Submitting a review advances the round

## Context

[[BDR-0015-review-batch-and-verdict]] adopted GitHub's model: a submitted review
carries one verdict (`approve` / `request_changes` / `comment`), and
[[BDR-0013-approval-model]] derived approval from the `approve` verdict, with
[[BDR-0012-soft-approval-gate]] warning (never blocking) on open `fix_required`
critique.

[[BDR-0018-project-boards-and-human-controlled-rounds]] made rounds per-artifact,
so the verdict landed per file: every file carried its own draft verdict chip,
its own standing verdict, and its own approved round, and the review-level
verdict was a rollup over them. In practice that second state machine paid for
nothing:

1. **It duplicated the critique.** A file with an open `fix_required` comment is
   already "changes requested"; a file with no open comment is already accepted.
   The verdict restated what the comments said, and could contradict them.
2. **It made "reviewed" ambiguous.** The navigator's `N/M reviewed` counter and
   the "Hide reviewed" filter keyed off "carries a verdict", which is a record of
   the reviewer clicking a chip, not of the file being read.
3. **Approval had no consumer.** Suikou is a local review loop between a human
   and an agent, not a merge gate. Nothing in the product blocks on `approved`,
   and the agent acts on comments, not on a disposition word.

## Behaviours Considered

### Option A: Critique only
Submitting publishes every pending comment and reply across the review and opens
the next draft round on each minted file. A submission records that a round was
submitted, nothing more. The reviewer's disposition lives entirely in the
comments they left: `fix_required` means work is owed, no open comment means
nothing is owed.

### Option B: Keep a review-level verdict, drop only the per-file one
Submitting still carries one verdict, recorded once for the review rather than
per file.

### Option C: Status quo — per-file verdict plus review rollup

## Decision

Option A. The comment layer already carries every signal a verdict expressed, at
a finer grain and with the reasoning attached. Removing the verdict removes a
state machine that could disagree with the critique it summarised, and removes
approval — a terminal state with no consumer — along with it.

Consequences:

- `Submissions.submit/1` takes only a round. A submission row records that the
  round was submitted; it is still the monotonic `submission_version` cursor the
  agent polls (see BDR-0014).
- Publishing stays review-wide and the round advance stays per artifact, exactly
  as [[BDR-0019-submit-publishes-review-wide-pending]] defines them.
- File-level critique is untouched: an `artifact`-scoped comment (see
  [[BDR-0022-comment-location-model-refactor]]) remains the way to say something
  about a whole file. Removing the verdict removes the chip, not the comment.
- The soft gate ([[BDR-0012-soft-approval-gate]]) disappears with the thing it
  gated. Open `fix_required` critique no longer warns on submit; it stays open
  and visible to the agent, which was always the actual mechanism.
- "Reviewed" as a per-file state is gone, and with it the navigator's reviewed
  counter and the "Hide reviewed" filter. Open-blocker counts remain the per-file
  signal.

## Rejected Alternatives

- **Review-level verdict only (B)**: keeps the duplication at a coarser grain. A
  single word over a multi-file review says less than the comments already say,
  and still needs an approval state to mean anything.
- **Status quo (C)**: two sources of truth for the same judgment, one of which
  (the chip) records clicks rather than critique.

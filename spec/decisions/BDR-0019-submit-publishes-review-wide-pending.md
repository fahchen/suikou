---
id: BDR-0019
title: Submitting a review publishes the whole review's pending critique, not just one file's
status: accepted
date: 2026-06-13
summary: A single submit publishes every pending comment across all of the review's files at once; the verdict and the round advance stay per file — only the submitted round records a verdict and opens a next round
---

## Scope

**Feature**: domains/critique/features/lifecycle.feature
**Rule**: Submitting a review publishes the review's pending comments

## Context

[[BDR-0008-submit-review-publishes-critique]] established the human-controlled
`pending`→`published` lifecycle and batched the transition at the round level —
submitting a file's round published only that round's pending comments.
[[BDR-0018-project-boards-and-human-controlled-rounds]] made rounds per-artifact:
each file advances independently, with its own verdict.

In practice a reviewer works across many files in one sitting and leaves pending
comments on several before they are done. Requiring a separate submit per file to
publish each file's critique is friction with no payoff: the reviewer thinks of
"submitting the review" as one act, and the agent is better served receiving the
whole review's critique together. We had to decide what scope a single submit
publishes.

## Behaviours Considered

### Option A: Submit publishes only the submitted file's round (status quo)
Submitting a file's round transitions only that round's pending comments to
`published`. Other files keep their pending comments until each is submitted
individually.

### Option B: Submit publishes every pending comment across the review
Submitting any file's round transitions all pending comments in the review — on
every file — to `published` at once. The verdict and the round advance stay
per file: only the submitted round records a verdict, carries forward, and opens
a next round. Other files' rounds are untouched; their now-published comments
carry forward when those files are later submitted.

### Option C: A separate review-level "publish all" action
Keep per-round submit as-is and add a distinct board-level button that only
publishes all pending comments without recording a verdict or advancing any
round.

## Decision

Option B. A reviewer's mental unit of work is "the review," not "this one file,"
so the publish step should match that unit while the disposition (verdict) and
versioning (round advance) stay per file where they belong. Folding the
review-wide publish into the existing Submit button keeps a single, familiar
action rather than introducing a second control with subtly different semantics
(Option C). The agent benefits too: it sees a coherent batch of the reviewer's
critique across the files they touched, not a per-file trickle.

The scope is the **review** (all of its non-removed artifacts), not the whole
project. Pending comments only ever live on a draft round and freeze on publish,
so the transition simply targets every `pending` comment whose artifact belongs
to the submitted round's review. Verdict recording, approval, carry-forward, and
opening the next round remain scoped to the submitted round alone.

## Rejected Alternatives

- **Per-file publish (A)**: forces one submit per file to make critique visible,
  which is friction the reviewer never asked for and splits a single review into
  many partial hand-offs to the agent.
- **Separate publish-all action (C)**: adds a second control whose meaning
  (publish without a verdict or round advance) diverges from Submit, inviting
  confusion about which to use; the reviewer wanted one button to do the
  review-wide publish.

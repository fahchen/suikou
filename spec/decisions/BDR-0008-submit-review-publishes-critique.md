---
id: BDR-0008
title: Submitting a review publishes a round's pending critique as a batch
status: accepted
date: 2026-06-07
summary: Comments are pending (mutable, hidden) until the human submits a review, which publishes that round's pending comments together, freezes their content, and exposes them to the agent
---

## Scope

**Feature**: domains/critique/features/lifecycle.feature
**Rule**: Submitting a review publishes its pending comments

## Context

A reviewer needs room to revise critique before the agent acts on it, but once
the agent has been handed feedback that feedback must be stable — the agent and
human have to be reasoning about the same text. We had to decide what marks a
comment as final and who controls that transition. The verdict the review also
carries is decided separately ([[BDR-0015-review-batch-and-verdict]]); this
decision is only about the pending→published lifecycle.

## Behaviours Considered

### Option A: Explicit submit-review, batched per round
A comment is `pending` (editable, deletable, invisible to the agent) until the
human submits a review. Submitting a review is a round-level action: it
transitions all of that round's pending comments to `published` at once.
Published comments are frozen in content and cannot be deleted; the agent only
ever exports the published set.

### Option B: First export locks
A comment is editable until the agent first exports it; the act of reading it
freezes it.

### Option C: No pending state
Every comment is final on creation.

## Decision

Option A. Control over when critique becomes final belongs to the human, not to
whenever the agent happens to read. Submitting a review gives the reviewer a
clean "I'm done with this round" moment and a coherent unit — the agent receives
a whole round's critique at once rather than a trickle. Batching at the round
level matches the iteration model (rounds are already the unit of versioning) and
keeps the agent's view consistent.

The freeze covers content and deletion only: `body`, `type`, `scope`, and the
line anchor become immutable. The `resolved` flag and `resolved_round` stay
mutable after publish, because resolution happens later — after the agent has
responded in a subsequent round.

## Rejected Alternatives

- **First export locks (B)**: ties finalization to the agent's read timing, so
  the human loses control of when editing stops and a mid-edit export could
  freeze half-written critique. Couples the lifecycle to the export feature
  instead of to a human intent.
- **No pending state (C)**: removes the reviewer's ability to revise a comment
  before the agent sees it, which is the whole point of a human-judgment surface;
  every typo or reconsidered point would already be visible to the agent.

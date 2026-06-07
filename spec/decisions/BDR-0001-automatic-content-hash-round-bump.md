---
id: BDR-0001
title: Automatic content-hash round bump, no normalization
status: accepted
date: 2026-06-06
summary: Rounds advance automatically when submitted content's hash differs from the latest snapshot; no normalization, no agent declaration
---

**Feature**: domains/artifacts/features/submission.feature
**Rule**: Resubmitting changed content creates a new round

## Context

When an agent resubmits a revised markdown artifact, the system must decide
whether this constitutes a new review round, and what counts as "changed".

## Behaviours Considered

### Option A: Automatic content-hash comparison (no normalization)
Server computes a hash of the submitted content and compares it to the latest
snapshot. Any byte-level difference advances the round.

### Option B: Automatic with normalization
Normalize whitespace/formatting before hashing so trivial format-only edits do
not create a new round.

### Option C: Agent-declared rounds
The agent explicitly signals "this is a new round" via the API.

## Decision

Option A. The server hashes submitted content and bumps the round (handled by
the Musubi runtime, which then broadcasts) whenever the hash differs from the
latest snapshot. Identical content is idempotent — no new round, no new
snapshot.

Chosen for simplicity and to keep round semantics out of the agent's hands.

## Rejected Alternatives

- **Normalization (B)**: adds a normalization spec to define and maintain, and
  hides genuine edits. The accepted tradeoff of Option A is that even a typo
  fix advances the round.
- **Agent-declared (C)**: pushes round semantics into the agent protocol and
  lets a buggy agent silently skip rounds.

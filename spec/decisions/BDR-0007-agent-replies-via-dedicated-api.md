---
id: BDR-0007
title: Agent participates in threads only through a dedicated reply API
status: accepted
date: 2026-06-06
summary: The agent may reply to existing comment threads via a reply API distinct from comment authoring, but never authors top-level comments or touches approval
---

## Scope

**Feature**: critique/features/discussion.feature
**Rule**: The agent replies through the dedicated reply API

## Context

The PRD says both the human and the agent participate in threaded discussion.
[[BDR-0003-server-authoritative-agent-submits-content-only]] establishes that the
agent submits artifact content only and never pushes critique. These pull in
opposite directions: if the agent can reply, it is writing review state, which
BDR-0003 forbids for top-level critique. We had to reconcile them.

## Behaviours Considered

### Option A: Dedicated reply API
The agent replies to an existing thread through a reply endpoint that is separate
from comment authoring. The agent can append a reply to a human-authored comment
but cannot create a top-level comment and cannot change approval state.

### Option B: Replies ride on the response/resubmission feature
The critique feature stays human-only. An agent's answer to a comment is carried
implicitly by the next content submission and lives in the response feature.

### Option C: No agent replies in the MVP
Threads allow human replies only; the agent answers by revising and resubmitting
content.

## Decision

Option A. A reply is a fundamentally different act from authoring critique: it is
scoped under an existing human comment, cannot exist on its own, and cannot
approve anything. Allowing the agent a narrow reply channel keeps the human as
the sole author of top-level critique and approval (honouring the spirit of
BDR-0003) while enabling the back-and-forth the closed loop needs — most directly
answering a `needs_answer` comment in place, where the context lives.

## Relationship to BDR-0003

This refines, and does not overturn, BDR-0003. The agent still never authors
critique nor mutates approval. The reply API is an explicitly bounded exception:
append-only, thread-scoped, no top-level or approval authority.

## Rejected Alternatives

- **Replies ride on resubmission (B)**: divorces an answer from the comment it
  answers, so the reviewer must correlate a content diff with a question by hand.
  Loses the in-context thread that makes `needs_answer` useful.
- **No agent replies (C)**: simplest, but breaks the discussion loop the PRD
  calls for; a question to the agent would have no in-band answer path.

---
id: BDR-0005
title: Single-dimension critique type with three agent-readable values
status: accepted
date: 2026-06-06
summary: A comment carries one critique type from {fix_required, needs_answer, note}, not the PRD's eight types nor a type+severity split
---

## Scope

**Feature**: critique/features/authoring.feature
**Rule**: A comment must declare a critique type

## Context

The PRD lists eight critique types: blocking, question, clarification,
suggestion, nit, risk, missing-context, inconsistency. We had to decide how much
of that taxonomy the MVP carries, and whether type and severity (blocking-ness)
are one dimension or two.

## Behaviours Considered

### Option A: Single dimension, three values
One field per comment, valued `fix_required` / `needs_answer` / `note`. The
values are verb/state phrased so the consuming agent knows the expected action
at a glance: must change, must respond, informational.

### Option B: Two dimensions (type + blocking)
A semantic `type` enum (question, suggestion, ...) orthogonal to a `blocking`
boolean, so e.g. a question can independently be blocking or not.

### Option C: Full PRD set
Carry all eight semantic types as a single enum.

## Decision

Option A. For a single-user, markdown-first MVP whose primary consumer is an
agent, the value of a critique type is telling the agent what to do, not
cataloguing the human's intent finely. Three action-oriented values cover the
closed loop — fix it, answer it, just read it — and an agent can branch on them
directly. Type is required on every comment.

## Rejected Alternatives

- **Two-dimension type+blocking (B)**: cleaner ontology (severity and intent are
  genuinely orthogonal), but it adds a field and decision burden the MVP does not
  need. The three chosen values already encode the only severity distinction that
  matters now (fix_required blocks; needs_answer and note do not).
- **Full eight-type PRD set (C)**: too fine for a human to apply consistently
  (question vs clarification, missing-context vs inconsistency blur in practice)
  and gives the agent more categories than it can act on differently. nit folds
  into note; risk/missing-context/inconsistency are expressed in the comment body.

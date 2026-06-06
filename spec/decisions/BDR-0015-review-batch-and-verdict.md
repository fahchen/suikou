---
id: BDR-0015
title: Critique is delivered as reviews carrying a verdict (GitHub model)
status: accepted
date: 2026-06-07
summary: The reviewer submits comments as a review batch that carries one verdict — approve, request_changes, or comment — and approval is folded into the approve verdict rather than being a separate action
---

## Scope

**Feature**: critique/features/review.feature
**Rule**: An approve verdict accepts the artifact

## Context

The reviewer's disposition toward a round — accept it, demand changes, or just
leave notes — has to be expressed somewhere. Earlier Suikou modelled this as a
standalone approval action ([[BDR-0013-approval-model]]) separate from critique.
We chose to adopt GitHub's pull-request review model wholesale, where a reviewer
submits a *review* (a batch of pending comments) and that submission carries one
verdict. We had to decide whether to keep approval separate or fold it into the
review verdict.

## Behaviours Considered

### Option A: Reviews carry a verdict; approval is the approve verdict
Submitting a review ([[BDR-0008-submit-review-publishes-critique]]) records one
verdict on that submission: `approve`, `request_changes`, or `comment`. The
artifact is approved exactly when the latest review on the latest round has
verdict `approve`. There is no separate approve action.

### Option B: Neutral publish plus a standalone approval action
The reviewer publishes critique with no disposition, and approval is an
independent action on the artifact (the prior model).

## Decision

Option A. Folding disposition into the review submission matches how reviewers
actually work — every time the human finishes a pass they have a stance, and
forcing a second, decoupled approval step splits one human intent into two
actions. GitHub's model is well understood: `comment` is neutral feedback,
`request_changes` signals revision is wanted, `approve` accepts. Approval becomes
a derived state (latest verdict is `approve`) rather than a parallel state machine
to keep in sync. The verdict lives on the review, so a round's disposition is
always tied to the comments that justified it.

A round may receive more than one review over time; the latest review's verdict
is the round's current disposition. Approval is reversible and is dismissed by an
agent resubmission — those mechanics are detailed in
[[BDR-0013-approval-model]], which this decision restructures around the verdict.

## Rejected Alternatives

- **Neutral publish plus standalone approval (B)**: keeps two state machines
  (published critique, and approval) that must agree, and divorces the accept/
  reject signal from the feedback that motivates it. A reviewer would publish
  critique and then separately approve, doubling the ceremony for one decision.

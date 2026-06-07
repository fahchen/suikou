---
id: BDR-0012
title: Approval is soft-gated — unresolved critique warns but never blocks
status: accepted
date: 2026-06-07
summary: The reviewer may submit an approve verdict even with open comments (including fix_required); the system warns but does not block, because the human holds final judgment
---

## Scope

**Feature**: critique/features/review.feature
**Rule**: An approve verdict is allowed with unresolved fix_required comments, with a warning

## Context

When the reviewer submits a review with verdict `approve`, there may still be
unresolved comments, including `fix_required` ones. We had to decide whether the
system enforces that all (or all blocking) comments be resolved before an approve
verdict is allowed.

## Behaviours Considered

### Option A: Soft gate (warn, allow)
An approve verdict is always permitted. If unresolved comments exist, the reviewer
is warned, but may approve anyway.

### Option B: Hard gate on fix_required
An approve verdict is blocked while any `fix_required` comment is unresolved.

### Option C: No gate
The verdict ignores comment state entirely; no warning.

## Decision

Option A. The product principle is that human judgment is the authority. A hard
gate would let the comment system override the reviewer — but the reviewer may
legitimately decide an open `fix_required` is moot, superseded, or acceptable, and
approve regardless. This is the soft coupling between the two critique layers
([[BDR-0016-two-layer-critique]]): the per-comment type advises the agent, it does
not veto the per-review verdict. A warning surfaces the open items so approval is
informed, without taking the decision out of the human's hands.

## Rejected Alternatives

- **Hard gate (B)**: makes `fix_required` a machine-enforced veto over the human,
  inverting who holds final judgment. The reviewer would have to perform busywork
  resolving comments purely to unlock a decision they have already made.
- **No gate (C)**: cheap, but lets the reviewer approve while genuinely unaware of
  open blocking feedback — the warning is the whole value of the gate.

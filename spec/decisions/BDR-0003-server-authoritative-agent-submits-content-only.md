---
id: BDR-0003
title: Server-authoritative state; agent submits content only
status: superseded
superseded_by: BDR-0018
date: 2026-06-06
summary: The local Suikou runtime owns review state; agents submit artifact content but never push comments or approval. Superseded by BDR-0018 — the agent no longer submits content; it only replies. Server-authoritative state still holds.
---

**Feature**: domains/artifacts/features/submission.feature
**Rule**: A first submission creates a review at round 1

## Context

Suikou must decide who owns review state, because this shapes the entire
submission and critique surface. The main alternative is a client-push model
where an external local daemon is the source of truth and pushes the full file
set *and* the full comment set on every upsert (wholesale replacement).

## Behaviours Considered

### Option A: Server-authoritative (Suikou)
The local Suikou runtime (Musubi) owns all review state. Agents submit artifact
content only. Comments are created server-side by the human reviewer via Musubi
commands; round bumps are computed and broadcast by the runtime. Agents *read*
critique (via export) but never push it back.

### Option B: Client-push authoritative
The agent/daemon holds the source of truth and pushes content plus comments,
with the server replacing its stored set on each push.

## Decision

Option A. Suikou is built on a server-authoritative Musubi runtime, even though
it runs locally. Agents are external participants that contribute content and
read structured critique; they do not own or mutate comments or approval state.

## Rejected Alternatives

- **Client-push + wholesale comment replacement (B)**: works when an external
  local daemon is the source of truth, but in Suikou the human's critique lives
  in the server and is authored through the web UI. Letting an agent push a
  comment set would let it clobber human-authored critique and would conflict
  with the principle that human judgment (critique and approval) is the product.

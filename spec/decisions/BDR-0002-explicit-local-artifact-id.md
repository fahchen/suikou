---
id: BDR-0002
title: Explicit local artifact id for cross-round identity
status: superseded
superseded_by: BDR-0018
date: 2026-06-06
summary: Artifacts are bound across rounds by a server-minted local id, not by a derived cwd path-hash. Superseded by BDR-0018 — the agent no longer resubmits, so there is no agent-supplied id to bind; the server mints an artifact id when the reviewer selects a file.
---

**Feature**: domains/artifacts/features/submission.feature
**Rule**: A first submission creates a review at round 1

## Context

The system must recognise that a resubmission belongs to the same artifact as a
prior submission so it can advance that artifact's round. The binding could be
implicit (derive identity from the working directory / file path, e.g.
`sha256(cwd + branch/args)`) or explicit (a server-returned id the agent stores).

## Behaviours Considered

### Option A: Server-minted explicit local id
First submission returns an `artifact_id`. The agent stores it and includes it
on resubmission to bind the new round.

### Option B: Implicit cwd path-hash
Derive the identity by hashing the working directory / file path at submission
time.

## Decision

Option A. Suikou runs as a persistent local Phoenix instance backed by SQLite,
so identity is an explicit primary key returned to the agent. Single local
instance, no sharing.

## Rejected Alternatives

- **Path-hash (B)**: a path hash suits a stateless CLI that must relocate its
  review directory from the current working directory on every command. Suikou
  has a running server and a database, has no cwd concept for a web client, and
  is single-user with no sharing — so a path hash adds fragility (symlink
  resolution, directory moves) with no benefit.

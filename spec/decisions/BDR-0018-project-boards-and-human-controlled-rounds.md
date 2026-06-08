---
id: BDR-0018
title: Project boards and human-controlled rounds
status: proposed
date: 2026-06-08
summary: A project is a directory; the human creates artifacts by selecting files from it and controls round advancement by submitting. The agent only replies; it never submits content or advances a round. Supersedes BDR-0001, BDR-0002, and BDR-0003.
---

**Feature**: domains/artifacts/features/submission.feature
**Rule**: The human creates the review unit and controls its rounds

## Context

The original model (BDR-0001, BDR-0003) made the **agent** the origin of
review state: the agent posted artifact content over the API, which created the
artifact at round 1 and advanced rounds automatically on content-hash change.
The human only critiqued and approved.

We are inverting ownership. The human drives the workflow end to end:

1. The human registers a **project** (a directory on disk).
2. The human creates an **artifact** by selecting a file from that project; the
   server reads the file from disk and snapshots it.
3. The human reviews the snapshot and **submits**; submitting advances the round.
4. The **agent only replies** to published comments. It never posts content and
   never advances a round. (Agent-initiated rounds are deferred to a future BDR.)

This BDR establishes the new top-level **Project** concept, redefines how an
artifact and its rounds come into being, and supersedes the agent-driven
submission and automatic round-bump decisions.

## Behaviours Considered

### Project ↔ directory mapping
- **A. Directory scan (chosen)**: a project points at a directory path; the
  server scans it and lists the files inside as candidate artifacts. The human
  picks a file to start reviewing it.
- **B. Logical grouping**: a project is just a label; artifacts are registered
  explicitly (closer to the old explicit-id model, BDR-0002). Rejected — the
  user wants the project board to reflect what is actually on disk.

### Round content source
- **A. Read disk on selection (chosen)**: selecting (or re-snapshotting) a file
  reads its current content from disk into a round. The agent edits files on
  disk; the human re-snapshots to pull changes in.
- **B. Agent pushes content over the API**: rejected — keeps an agent ingestion
  path the new model removes.

### Round numbering and the "draft" round
- **A. Persisted round 0 (chosen)**: selecting a file persists a real **round 0**
  in draft state (mutable pending comments). On submit, round 0's review is
  published and a **round 1** is created by copying content forward and carrying
  unresolved comments. Rounds are numbered from 0.
- **B. Round 0 is purely conceptual**: the first persisted round is round 1 and
  "round 0" is just spoken shorthand for its draft state. Rejected — the user
  chose to persist round 0 as its own row.

## Decision

**Project** is a new top-level concept: a directory on disk. The server scans a
registered project directory and exposes its files as candidate artifacts.

**Artifact creation is a human action.** The human selects a file under a
project; the server reads that file from disk and persists a **round 0** for the
new artifact in draft state. There is no agent content submission and no initial
round created by an agent.

**Rounds are human-controlled.** A round lives in two phases:

- **Draft**: the reviewer authors pending comments and sets a pending verdict.
- **Submitted**: on submit, the round's pending comments are published, its
  verdict is recorded, and the next round is created by copying the snapshot
  forward and carrying unresolved published comments (the existing
  carry-forward + re-anchor mechanism, unchanged). Submitting is what advances
  the round.

Concretely: selecting a file creates **round 0** (draft). Submitting round 0
publishes its review and creates **round 1** (the next draft). The reviewer
refreshes a draft round's content by re-snapshotting the file from disk after
the agent edits it.

**The agent only replies.** It may post replies to published comments via the
dedicated reply API (BDR-0007, unchanged). It never submits content and never
advances a round.

## Rejected Alternatives

- **Agent-driven rounds (BDR-0001, BDR-0003)**: superseded. Round advancement is
  no longer triggered by an agent content resubmit or a content-hash bump; it is
  triggered by the human submitting a round.
- **Logical-only projects**: rejected in favour of directory scanning so the
  board reflects the filesystem.
- **Agent-pushed content**: rejected; content enters only by the server reading
  the selected file from disk.

## Supersedes

- BDR-0001 (automatic content-hash round bump) — rounds now advance on human
  submit, not on agent content change.
- BDR-0003 (server-authoritative agent submits content only) — the agent no
  longer submits content; it only replies.
- BDR-0002 (explicit local artifact id) — there is no agent resubmission to bind;
  the server mints an artifact id when the reviewer selects a file.

## Deferred

- **Agent-initiated rounds**: a future agent that proposes a new round (e.g. by
  signalling its disk edits) is out of scope here and will get its own BDR.
- **Other artifact sources**: v1 supports only a local file read from a project
  directory. Additional sources (e.g. a GitHub pull request) are anticipated but
  not designed here; each will get its own BDR when built.

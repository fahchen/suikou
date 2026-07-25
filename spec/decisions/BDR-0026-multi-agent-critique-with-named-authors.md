---
id: BDR-0026
title: Agents author critique under their own name
status: accepted
date: 2026-07-25
summary: Any number of agents review alongside the human, authoring top-level comments, replies and reactions under a self-supplied name and icon; only submitting a round and approval stay the human's
---

## Scope

**Feature**: domains/critique/features/discussion.feature, domains/critique/features/authoring.feature
**Rule**: An agent authors critique under its own name

## Context

[[BDR-0007-agent-replies-via-dedicated-api]] gave the agent a reply-only channel:
it could answer a human comment but never open one. That was right when there
was one agent and it was the *author* of the work under review — a reviewee, not
a reviewer.

The workflow we actually want now is several agents reviewing a change together
and with the human: one finds the bug, another argues the fix is wrong, the human
adjudicates. Two things block that. An agent cannot open a comment, so a finding
has nowhere to live except a reply to something the human already thought of. And
every agent row reads as `author: :agent`, so a thread with three agents in it is
an undifferentiated wall — the reader cannot tell a claim from its rebuttal, and
an agent polling `wait` cannot tell its own last word from a peer's.

## Behaviours Considered

### Option A: Named authors, denormalized per row
An agent names itself on each command (`--as`, `--icon`); the name and icon are
stored on the comment, reply, or reaction row. Any agent may author a top-level
comment, published immediately, and may resolve any comment. The human keeps the
round and the verdict.

### Option B: A registered participant roster
Agents register once into a `participants` table and reference it by id. Rows
carry a foreign key rather than a name.

### Option C: Keep reply-only, distinguish by name
Agents get names but the reply-only boundary from BDR-0007 stands. An agent's
finding is posted as a reply to some existing comment.

## Decision

Option A.

*Named, not registered*: an identity here is a label on a message, not an account.
Nothing authenticates it and nothing else hangs off it, so a roster would add a
lifecycle (register, rename, retire, garbage-collect the unused) to buy
referential tidiness we have no use for. A denormalized name also keeps the row
truthful after the fact: it records what the author called itself when it wrote,
which is what a reader of an old thread wants.

*Top-level comments*: a review is a set of findings, and a finding that has to be
smuggled in as a reply to an unrelated comment is a worse artifact than one that
stands on its own. The reasons BDR-0007 withheld this were that the agent was the
reviewee and that critique authority belonged to the human; the first no longer
holds for a reviewing agent, and the second is preserved below.

*Agents may resolve*: resolution marks "this was addressed", which is a claim
about the work, not a verdict on it. An agent that fixed the thing is the party
best placed to say so, and the human reopens anything they disagree with — the
reply path already auto-reopens on a human reply.

*What stays the human's*: submitting a round and the approval verdict
([[BDR-0018-project-boards-and-human-controlled-rounds]],
[[BDR-0013-approval-model]]). An agent comment is published on write because an
agent has no draft stage to batch — it does not gain the agent a say in when a
round closes.

*Anonymity is the default, not an error*: a missing name stores `""`. The human
reviews anonymously by design (there is one human and the UI already knows who
they are), and an agent that omits `--as` behaves exactly as it did before this
decision, which keeps every existing skill and script working.

## Consequences

- `Suikou.Export` emits `author` / `actor` as `%{kind, name, icon}` instead of a
  bare `:human | :agent`. Agents parsing an export see a shape change.
- `wait`'s working-set filter is per-caller: with `--as`, a comment is dropped
  only when *that* agent had the last word, so a peer's unanswered critique still
  wakes it. Without `--as` the old single-agent behaviour is preserved.
- A reaction's uniqueness key widens from `(target, actor)` to
  `(target, actor, actor_name)`, so two agents can hold their own reactions on
  one comment.

## Rejected Alternatives

- **Registered roster (B)**: buys a rename-propagates property nobody asked for,
  at the cost of a registration step before an agent can say anything and a
  roster that accumulates dead entries. Revisit if identities ever need to carry
  state of their own (permissions, per-agent settings).
- **Reply-only with names (C)**: names alone fix legibility but not structure. A
  second reviewer's independent finding would still have to attach itself to
  whatever the human happened to comment on, which misfiles it and makes the
  resolved/unresolved bookkeeping meaningless.

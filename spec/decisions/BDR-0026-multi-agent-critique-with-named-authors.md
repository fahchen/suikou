---
id: BDR-0026
title: Agents author critique under their own name
status: accepted
date: 2026-07-25
summary: Any number of agents review alongside the human, authoring top-level comments, replies and reactions under a required, self-chosen name; the human keeps one reserved fixed name, and submitting a round and approval stay theirs
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
an undifferentiated wall — neither the human nor an agent reading it back can
tell a claim from its rebuttal.

## Behaviours Considered

### Option A: Named authors, denormalized per row
An agent names itself on each command (`--as`, `--icon`) — the name is required
and is the agent's own choice, not its model — and it is stored on the comment,
reply, or reaction row. The human has one fixed reserved name that no agent may
claim. Any agent may author a top-level comment, published immediately, and may
resolve any comment. The human keeps the round and the verdict.

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
reply path already auto-reopens on a human reply. The claim records its claimant
for the same reason a comment does: with several agents resolving, "addressed"
without "by whom" is not something the human can weigh.

*What stays the human's*: submitting a round and the approval verdict
([[BDR-0018-project-boards-and-human-controlled-rounds]],
[[BDR-0013-approval-model]]). An agent comment is published on write because an
agent has no draft stage to batch — it does not gain the agent a say in when a
round closes.

*A name is required of agents, fixed for the human*: the whole point is telling
speakers apart, and an unnamed row defeats it — so a write without `--as` is
refused at the boundary, before anything is stored. The human is the opposite
case: there is exactly one of them, so they need no per-call name and get a
reserved one (`"human"`) instead. An agent claiming it is refused, so nothing an
agent writes can be mistaken for the reviewer's own word. The name an agent picks
is its own — a handle, a role, anything but the reserved one; tying it to the
model would collapse two agents of the same model into one voice.

*`wait` is not identity-scoped*: it blocks on the human publishing a round, not
on any one comment, so it takes no name. Its working set drops what an agent
already answered — which agent does not change whether the round has landed.

## Consequences

- `Suikou.Export` emits `author` / `actor` as `%{kind, name, icon}` instead of a
  bare `:human | :agent`. Agents parsing an export see a shape change.
- `wait` is unchanged: it still blocks on a submission and still drops comments
  an agent already answered. An agent-authored comment nobody has answered is in
  the working set, which is what makes a peer's finding reachable.
- A reaction's uniqueness key widens from `(target, actor)` to
  `(target, actor, actor_name)`, so two agents can hold their own reactions on
  one comment. An agent may no longer react with one of the reviewer's four
  approval keys: the client groups a chip by glyph alone, so that would have
  counted an agent into the human's own chip.
- A resolved comment carries `resolved_by` / `resolved_by_name`. Rows resolved
  before this decision report `null` — unknown, rather than asserting the human.
- Opening a file and inserting an agent's comment share one transaction, so a
  rejected comment leaves no half-opened file behind.

## Rejected Alternatives

- **Registered roster (B)**: buys a rename-propagates property nobody asked for,
  at the cost of a registration step before an agent can say anything and a
  roster that accumulates dead entries. Revisit if identities ever need to carry
  state of their own (permissions, per-agent settings).
- **Reply-only with names (C)**: names alone fix legibility but not structure. A
  second reviewer's independent finding would still have to attach itself to
  whatever the human happened to comment on, which misfiles it and makes the
  resolved/unresolved bookkeeping meaningless.

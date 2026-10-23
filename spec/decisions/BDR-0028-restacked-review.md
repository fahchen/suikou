---
id: BDR-0028
title: Restacked review — an agent-cut review stack as a second view over a git-diff review
status: accepted
date: 2026-10-23
summary: A git-diff review may carry a `stack_ref`, a branch an agent cut from the source into small dependency-ordered commits. Suikou verifies at attach time that the stack's tip tree equals the source tip tree on the same merge-base, re-checks sync on every render, and lets the reviewer switch between the source view and a step-by-step stack view. Fixes land on the source and are cherry-picked onto the stack. Comments stay commit-free and re-anchor by quote
---

## Scope

**Feature**: domains/review/features/restacked-review.feature
**Rule**: A review stack carries exactly the source change

## Context

A branch's history is shaped by how it was written, not by how it is best read. Commits mix refactors with behaviour changes, fix earlier commits, or bundle a whole feature. Reviewing the aggregate `base...head` diff ([[BDR-0020-git-diff-review-type]]) or picking commits ([[BDR-0025-diff-review-branch-refs-and-commit-multiselect]]) does not help when the commits themselves are the wrong size.

An agent can re-cut the same change into a **review stack**: small commits, ordered by dependency, one behaviour each, so the reviewer reads foundations before their consumers. The reviewer still reviews the source branch; the stack is only a better reading order for it.

## Behaviours Considered

### What the review is about
- **A. The source branch, with the stack as a second view (chosen)**: the review keeps `base_ref..head_ref`; `stack_ref` is optional and switchable.
- **B. The stack itself**: the review would track a branch that never ships.

### Who restacks
- **A. The agent (chosen)**: consistent with [[BDR-0003-server-authoritative-agent-submits-content-only]] and [[BDR-0018-project-boards-and-human-controlled-rounds]] — the agent writes to the repository; Suikou never authors content.
- **B. Suikou**: would need an LLM inside the runtime.

### Trusting the stack
- **A. Suikou verifies tree equality and merge-base (chosen)**: the reviewer must read exactly what ships, without taking the agent's word for it.
- **B. Trust the agent**: a dropped hunk would go unreviewed silently.

### Fixes during review
- **A. Commit to the source, cherry-pick onto the stack (chosen)**: the source stays the shipping branch; the cherry-picked commit becomes a new last step, so the next round reads only the fix.
- **B. Re-cut the whole stack each round**: every SHA changes and the reviewer loses their place.

### Out-of-sync stack
- **A. Warn, keep reviewable (chosen)**: a banner in the stack view asks the agent to sync; content stays readable and commentable.
- **B. Block with an error page**: hides useful context while the agent catches up.

### Comments across steps
- **A. Bind each comment to its step's commit**: needs a commit SHA on the anchor.
- **B. Re-anchor by quote, as every diff review does (chosen)**: no new field; a comment that does not locate in the current step's patch surfaces in the stranded band ([[BDR-0024-diff-review-live-lens-scope-and-worktree]]).

### Reading progress
- **A. Client-side, keyed by review id and commit SHA (chosen)**: no server state; cherry-picked steps start unread, and a re-cut stack resets naturally.
- **B. Server-persisted "reviewed" marks**: a new table and command for a per-device convenience.

## Decision

### 1. `Review.source = GitDiff` gains an optional `stack_ref`

`stack_ref` is a branch name, nullable, re-resolved on every render like `base_ref` and `head_ref` ([[BDR-0025-diff-review-branch-refs-and-commit-multiselect]] §1). A file-selection review never carries one.

### 2. Attaching verifies equivalence

The agent attaches a stack at creation (`suikou review create --diff main..feat --stack feat-review`) or later (`suikou review set-stack <review-id> feat-review`). Attaching is rejected unless:

- `merge-base(base, stack) == merge-base(base, head)`, and
- the stack tip's tree equals the head tip's tree. A rejection lists the differing paths.

### 3. Sync is live

Each render reports whether the stack tip tree still equals the head tip tree. Out of sync is a warning, never an error: the stack view shows a banner asking the agent to cherry-pick the source's new commits onto the stack. A vanished `stack_ref` disables only the stack view, which shows an error asking the agent to re-attach a stack with `set-stack`; the source view is unaffected.

### 4. Two views over one review

- **Source view**: the existing diff review, Scope tab included.
- **Stack view**: the stack's commits as steps, oldest first, each rendered against its first parent with its full commit message. `All changes` renders the whole `base...stack` diff.

A stacked review opens in the stack view, on the first unread step. The view and step live in the URL.

A stack-view file is commentable only when its path is in the source diff; a path a step touches with no net source change is read-only, because rounds snapshot the source diff.

### 5. UI

- **Board card**: the `Diff` pill becomes `Stack · N commits`; the refs line adds `· stack <stack_ref>`; out of sync turns the pill amber.
- **Desktop, wide (≥ 1280px)**: a step rail replaces the file list — every step in order, the current step expanded to its files, a `Source | Stack` switch on top, `All changes` at the bottom, Prev/Next at the foot of the content.
- **Desktop, medium**: the rail collapses into a drawer over the diff; a step bar (`◂ 2/5 <subject> ▸`) opens it.
- **Mobile**: the rail lives in the Files sheet; a fixed bottom bar carries Prev, the step, a read toggle, and Next.
- **Keyboard**: `[` / `]` step; existing file keys work within a step.
- **Progress**: a manual read toggle per step, stored in `localStorage` under the review id and commit SHA.

## Rejected Alternatives

- **The stack as the review's subject (B, "what the review is about")**: the stack never ships.
- **Suikou restacking**: puts content authoring inside the runtime.
- **Trusting the agent's stack unverified**: silent loss of reviewed scope.
- **Re-cutting per round**: destroys reading position and progress every round.
- **Step-bound comments**: diverges from every other diff review for little gain.
- **Server-persisted progress**: new state for a per-device convenience.

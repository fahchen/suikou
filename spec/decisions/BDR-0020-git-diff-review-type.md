---
id: BDR-0020
title: Git-diff review type with immutable refs and diff-hunk anchors
status: accepted
date: 2026-06-13
summary: A review may be sourced from the files changed between two refs; each artifact is that file's unified diff rendered as a two-column structured diff, and located comments anchor to a diff hunk span that re-anchors by quote across re-snapshots
---

## Scope

**Feature**: domains/review/features/review.feature, domains/critique/features/authoring.feature, domains/critique/features/carry-forward.feature
**Rule**: A git-diff review snapshots the merge-base diff between fixed refs and lets the reviewer comment on diff hunks

## Context

[[BDR-0018-project-boards-and-human-controlled-rounds]] made a reviewer's unit of
work a server-read snapshot from a project on disk. The first source variant was
file selection: the reviewer picked concrete paths and reviewed each file's
content directly.

The next requested source is a branch comparison. The reviewer wants to ask
"what changed on this branch?" and review that delta as one review, file by
file, without first selecting individual paths. That requires deciding what a
git-diff review's artifacts are, which refs it compares, how stable the review's
contents stay after creation, and how a comment attaches to a diff rather than a
plain file snapshot.

The shared model refactor in [[BDR-0022-comment-location-model-refactor]] makes
anchor kind polymorphic, and [[BDR-0017-polymorphic-selector-anchor]] already
established quote-based re-anchoring as the rule for located comments. This BDR
applies that model to diff hunks.

## Behaviours Considered

### Comparison baseline
- **A. Three-dot merge-base diff (chosen)**: compare `base...head`, so the
  review covers the changes introduced by `head` since the branches diverged.
- **B. Two-dot direct diff**: compare `base..head`, which also includes changes
  that live only on `base` and are not part of the branch under review.

### Ref mutability
- **A. Refs fixed at creation (chosen)**: a review stores `base_ref` and
  `head_ref` once. Changing branches means creating a new review.
- **B. Editable refs**: let the reviewer retarget a review to other refs and
  reconcile the artifact set in place.

### Diff presentation
- **A. Structured two-column diff (chosen)**: parse the unified diff and render
  old and new sides separately.
- **B. Raw diff text**: show the patch as syntax-highlighted text and comment on
  rendered lines.

## Decision

### 1. A git-diff review is a first-class review source

`Review.source` may be a `git_diff` variant alongside file selection
([[BDR-0022-comment-location-model-refactor]]). Its stored fields are
`base_ref` and `head_ref`. The review's artifacts are the files changed between
those refs; the reviewed content for each artifact is that file's unified diff,
not the file's full text.

The default base ref is the repository default branch, resolved by the fallback
chain `origin/HEAD` -> `main` -> `master` -> current `HEAD`. The fallback ends
at current `HEAD` because local-first repositories may have no remote default.

### 2. Comparison uses the three-dot merge-base diff

The diff is `base...head`, not `base..head`. The review question is "what did
this branch introduce relative to where it forked from the base branch?", not
"how do these two tips differ in every direction?". Three-dot answers the first
question directly by diffing `head` against the merge base, which avoids pulling
in changes that exist only on `base` and are not authored by the branch being
reviewed.

### 3. Refs are immutable in v1

`base_ref` and `head_ref` are fixed when the review is created. If the reviewer
wants a different comparison, they create a new review.

This keeps the review's artifact set, comments, and round history stable. An
"edit refs" flow would need to reconcile added, removed, and renamed diff
artifacts under an existing review and answer what happens to comments anchored
to hunks that disappear under the new comparison. That is extra policy and data
machinery with no v1 caller, so it is deferred.

### 4. Diffs render as a two-column structured view

The frontend renders each artifact as a structured diff with an old column and a
new column, not as raw patch text. A diff is inherently two-sided, and the
comment anchor needs an explicit side (`:old` or `:new`) plus start and end
lines within that side. The UI model should match the anchor model rather than
trying to reconstruct sided structure from a flat text view.

`ReviewStore.state.artifact` therefore carries a content kind hint of `:diff`
for these artifacts so the frontend routes to the diff renderer regardless of
file extension.

### 5. Located diff comments use a `diff_hunk` anchor with quote re-anchoring

Located comments on a diff artifact use `Anchor.DiffHunk` with
`side :: :old | :new`, `start_line`, `end_line`, and `quote`
([[BDR-0022-comment-location-model-refactor]]). In v1 the selection stays on a
single side of the diff.

The captured quote strips the leading `+` or `-` patch marker before storage.
That keeps the stored quote aligned with the text the reviewer actually selected
and lets re-anchoring compare content lines rather than patch syntax.

Server-side resolution follows the same rule as `line_range`
([[BDR-0017-polymorphic-selector-anchor]], superseding the exact-match model in
[[BDR-0010-exact-quote-reanchor]]): when the diff artifact is re-snapshotted,
the server re-locates the `diff_hunk` by quote against the new diff text and
marks the comment outdated on a miss.

### 6. Git access lives in the shared kernel via a no-shell adapter

Git inspection is provided by `Suikou.Git` in the open shared kernel, callable
from `Reviews` and `Artifacts` and not backed by `Repo`. All commands go through
`System.cmd/3`, never a shell, and path arguments are separated with `--`.

The security rule is simple: treat refs and paths as command arguments, not
shell fragments. No shell means no shell interpolation, and `--` prevents a file
path from being parsed as an option. The adapter remains responsible for passing
only explicit git subcommands and argument positions the product owns.

## Rejected Alternatives

- **Two-dot diff (B)**: answers the wrong review question by mixing in changes
  that belong only to the base branch's tip, which makes the artifact set drift
  away from "what this branch changed".
- **Editable refs (B)**: forces artifact reconciliation and comment-retention
  policy into v1; a new review is cheaper and keeps lineage honest.
- **Raw patch text (B)**: flattens a two-sided structure into one text block,
  then forces comment anchoring and rendering to reconstruct old/new semantics
  indirectly.


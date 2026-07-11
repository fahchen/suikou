---
id: BDR-0024
title: Diff review live lens — commit scope and working-tree source as request-time overlay
status: accepted
date: 2026-07-10
summary: A git-diff review keeps its pinned base_ref/head_ref, but the reviewer may switch the rendered diff between the full base...head range, a single commit inside that range, or the current staged/unstaged working tree — all as request-time query params re-read from git, without mutating the review row
---

## Scope

**Feature**: domains/review/features/review.feature
**Rule**: A git-diff review may be viewed through a live lens — commit scope and working-tree source — chosen per request, without changing the review's stored refs

## Context

[[BDR-0020-git-diff-review-type]] established the git-diff review as
three-dot `base...head` between two refs fixed at creation. §3 explicitly
made refs **immutable in v1** — "changing branches means creating a new
review" — because a full "edit refs" flow would need artifact reconciliation
and comment-retention policy that had no v1 caller.

The 2026-07-10 Phase P4 work found two review workflows that BDR-0020 alone
cannot express:

1. **Per-commit navigation.** The reviewer wants to walk the range one
   commit at a time, seeing exactly what that commit introduces (against
   its first parent), instead of the whole aggregate `base...head` diff.
2. **Working-tree lens.** The reviewer is still in the middle of authoring
   the branch and wants to see uncommitted changes — either the current
   index (`staged`) or the working tree (`unstaged`) — while the review's
   pinned `head_ref` still names the last committed tip.

Both are read-only view choices. Neither changes what the review "is" (the
pinned base/head refs, the artifact set, the round history, the comment
lineage). They only change how the current unified diff text is computed
when the frontend fetches file content.

## Behaviours Considered

### Where the lens lives
- **A. Request-time query overlay (chosen)**: the review row stays exactly
  as BDR-0020 defines it; `scope` and `worktree` are query params on
  content fetches, re-interpreted server-side against live git.
- **B. New source variants**: introduce sibling `Review.source` types
  (`GitDiffPerCommit`, `GitDiffStaged`, `GitDiffUnstaged`) and force the
  reviewer to pick at creation.
- **C. Mutable review fields**: add `scope` / `worktree` columns to
  `Review.source = GitDiff` and let the reviewer edit them in place.

### Boundary — single commit × working tree
- **A. Disable the combination (chosen)**: `worktree ∈ {:staged,
  :unstaged}` requires `scope = :all`; a historical commit has no
  current working tree, so a UI toggle offering "commit X + unstaged"
  would render a lie.
- **B. Reinterpret it**: silently ignore `scope` when `worktree` is
  set and render the working tree as if the reviewer chose "all".

### Comment drift on lens switch
- **A. Reuse E7/E8 re-anchor + E16 stranded band (chosen)**: a lens
  switch mutates the diff text underneath existing `diff_hunk` comments;
  ones whose stored quote no longer matches surface in the stranded band
  with a Re-anchor action, exactly as [[BDR-0017-polymorphic-selector-anchor]]
  and [[BDR-0010-exact-quote-reanchor]] already do for on-disk edits.
- **B. Snapshot per lens**: pin the diff text server-side per
  `(review, scope, worktree)` triple and freeze anchors against that
  snapshot.

## Decision

### 1. `Review.source = GitDiff` stays immutable

BDR-0020 §3 is preserved: `base_ref`, `head_ref`, `base_sha`, `head_sha`
remain fixed at creation. Changing branches still means creating a new
review. This BDR does not add editable ref fields, per-commit source
variants, or stored working-tree state.

The review's *identity* (which files it covers, which comments belong to
it, which round it is on) continues to be defined entirely by the pinned
refs. What changes is the reviewer's *view* over those refs.

### 2. Scope and worktree are request-time query params

Two new query parameters flow from the frontend through
`SuikouWeb.AssetController.file_content/2` into
`Suikou.Reviews.fetch_content_by_path/3` (arity extended):

- `scope=all` (default) | `scope=commit:<sha>`
- `worktree=diff` (default) | `worktree=staged` | `worktree=unstaged`

Both are re-read from git on every request, matching the existing
"live re-read on every request" contract for `GitDiff` content
(`Suikou.Reviews.fetch_content_by_path/2` already re-shells out; no
snapshotting). The reviewer's choice lives in the client
(`uiStore.diffScope`, `uiStore.diffWorktree`) with per-review persistence.

Server-side interpretation:

| `scope`         | `worktree`   | Diff computed                              |
|-----------------|--------------|--------------------------------------------|
| `all`           | `diff`       | `git diff base_ref...head_ref -- <path>` (unchanged from BDR-0020) |
| `commit:<sha>`  | `diff`       | `git show --format= --patch <sha> -- <path>` |
| `all`           | `staged`     | `git diff --cached HEAD -- <path>` |
| `all`           | `unstaged`   | `git diff -- <path>` (working tree vs. index) |

`scope=commit:<sha>` is honored only when `<sha>` is one of the commits
returned by `Suikou.Git.list_commits/3` for the review's pinned range —
otherwise the request answers 404 (`{:error, :commit_not_in_range}`),
so a malicious or stale sha cannot leak an out-of-range diff.

### 3. `single commit × working tree` is disabled

`worktree ∈ {:staged, :unstaged}` requires `scope = :all`. A request that
combines `scope=commit:<sha>` with `worktree=staged|unstaged` answers 400
(`{:error, :invalid_scope_worktree_combination}`); a historical commit
has no current working tree.

The frontend enforces this by disabling the working-tree segmented
control while `diffScope` is a single commit, and reset-to-`diff` when
the reviewer picks a commit from the popover.

### 4. `list_files/1` also lenses

The file list follows the same overlay so the navigator matches the
rendered diff:

- `scope=all, worktree=diff` — existing `Git.changed_files_with_status/3`.
- `scope=commit:<sha>, worktree=diff` — files changed by that commit
  alone (`git diff-tree --no-commit-id --name-status -r <sha>`).
- `scope=all, worktree=staged` — `git diff --cached --name-status HEAD`.
- `scope=all, worktree=unstaged` — `git diff --name-status` (working
  tree vs. index).

`change_status` and `added/deleted` line counts stay per-lens (recomputed
against whichever diff surfaces). Files present in the pinned
`base...head` set but absent from the current lens surface as *empty
navigator entries* under that lens, not as errors — the reviewer keeps
their comment context, they just cannot open a hunk that does not exist
in the current view.

### 5. Comment anchors drift into the stranded band on lens switch

A lens switch does not mutate stored `diff_hunk` anchors. It changes the
diff text those anchors are re-located against. On each render, the
existing quote re-anchor rule (BDR-0020 §5, [[BDR-0017-polymorphic-selector-anchor]])
re-runs against the current lens's diff:

- Anchor quote still matches → the comment stays anchored on the
  re-rendered hunk.
- Anchor quote no longer matches → the comment surfaces in the E16
  stranded band with a Re-anchor action, exactly as it does for a
  server-side re-snapshot after on-disk edits.

No per-lens snapshot is stored. Switching lenses is a client action
whose only server effect is the next content fetch.

### 6. Reactions, verdicts, and round history are lens-invariant

A per-file verdict, an approval, a round rollup, and a comment reaction
all belong to the review's *identity* (the pinned refs), not to the
current lens. Switching from "all commits" to "commit X" does not
change any of them. A verdict set while viewing `staged` is still that
file's verdict when the reviewer flips back to `diff`.

### 7. Security boundary — same whitelist rule

Path whitelist stays the union of every lens's `list_files/1`, computed
per request against the current lens. `../` traversal and paths outside
the review's project are rejected exactly as BDR-0020 §6 already
requires (all git calls go through `System.cmd/3`, never a shell, paths
after `--`).

## Rejected Alternatives

- **New source variants (B)**: forces the reviewer to pick a lens at
  creation, doubles the review schema, and makes "walk commit-by-commit
  then step back to the aggregate" a data-migration instead of a click.
- **Mutable review fields (C)**: puts view state into the review row,
  breaks BDR-0020 §3's immutable-refs guarantee, and needs an editable
  refs flow's reconciliation policy (which is exactly what BDR-0020
  deferred).
- **Reinterpreting single-commit + worktree (B under boundary)**: renders
  a diff that does not match what the reviewer asked for and hides the
  invalid combination behind silent fallback — worse than a 400.
- **Per-lens snapshots (B under drift)**: needs a snapshot key per
  `(review, scope, worktree)` triple, storage of the diff text, and
  invalidation on every underlying git mutation. The re-anchor path is
  already the answer for on-disk edits; extending it to lens switches
  costs nothing and stays consistent.

## Supersession

This BDR **relaxes** [[BDR-0020-git-diff-review-type]] §3 without
retiring it. The immutable-ref rule remains true for the *stored*
review; it no longer implies that the *rendered* diff is fixed. All
other BDR-0020 decisions (three-dot merge base, structured diff render,
diff_hunk anchor with quote re-anchoring, shared-kernel `Suikou.Git`
adapter) continue unchanged.

---
id: BDR-0025
title: Diff review stores branch refs (not pinned SHAs) and picks scope via multi-select commits + worktree
status: accepted
date: 2026-07-11
summary: A git-diff review stores only `base_ref` and `head_ref` as branch names; every render resolves them live. The reviewer picks a **worktree** (branch-range diff, staged, or unstaged) and, when in `diff` mode, an optional **multi-select commit subset** whose range is `<oldest>^..<newest>`. A ref that no longer resolves surfaces as an error state
---

## Scope

**Feature**: domains/review/features/review.feature
**Rule**: A git-diff review is a live view over the project's current branches; scope + worktree are per-request lens params, not stored state

## Context

[[BDR-0020-git-diff-review-type]] pinned each review's `base_sha`/`head_sha`
at creation and rendered the diff against the pinned SHAs. That preserved
review stability across ref moves, but the "refs moved" and "branch deleted"
banners drifted quickly into noise on any active branch. Reviewers wanted
the diff to always reflect the current branch state; they'd rather see the
review break outright when a branch is gone than silently render a stale
snapshot.

[[BDR-0024-diff-review-live-lens-scope-and-worktree]] introduced the live
lens (commit scope × working-tree worktree) as a per-request overlay on top
of the pinned SHAs. That was the right *interaction* shape, but keeping the
pinned SHAs alongside the live lens meant two sources of truth for what the
review renders. The reviewer's mental model was `branch := current tip`,
not `branch := pinned SHA + lens overlay`.

This BDR consolidates:
- **Refs are branch names**, not SHA snapshots. Every content/list read
  re-resolves the ref against the current tree.
- **Scope is multi-select**, not a single-commit picker. Selecting a
  subset renders the range `<oldest>^..<newest>`, which matches how a
  reviewer thinks about "look at these three commits together".
- **Worktree × non-empty commits is invalid**, kept from BDR-0024 §3.

## Behaviours Considered

### Ref storage
- **A. Branch name only (chosen)**: store `base_ref`/`head_ref`; resolve
  every render. A vanished ref → error page + delete-review affordance.
- **B. Pinned SHAs + editable ref hint (BDR-0020)**: stable but the "refs
  moved" state becomes noise on any active branch.
- **C. Branch name + last-good SHA fallback**: try current tip, fall back
  to the last-good SHA. Fixes noise but the fallback drift is invisible
  and defeats the point of "review against current tree".

### Scope shape
- **A. Multi-select commits, range diff (chosen)**: `{:commits, [sha]}`.
  Empty = full range; one = that commit; many = `<oldest>^..<newest>`.
  Matches how reviewers group commits mentally.
- **B. Single commit + all commits (BDR-0024)**: fine for cherry-picking
  a commit, but forced a mode switch to review three related commits.

### Ref-not-found presentation
- **A. Error page in content area, chrome stays (chosen)**: reviewer sees
  which ref broke and can jump back to the board to delete the review.
- **B. Full-screen "review broken" state**: hides context (name, project)
  and forces a re-navigate.
- **C. Silent fallback to empty file list**: hides the failure mode.

## Decision

### 1. `Review.source = GitDiff` stores only branch names

The schema keeps `base_ref` and `head_ref` (both non-null). The
`base_sha`/`head_sha` fields established by [[BDR-0020-git-diff-review-type]]
§1 are removed. Every content read (`Reviews.list_files/1..2`,
`Reviews.fetch_content_by_path/2..3`, `Reviews.list_diff_commits/1`)
re-resolves both refs on every call.

### 2. Refs are re-read on every render

`Suikou.Git.rev_parse/2` is not called at creation time to pin SHAs. There
is no "creation SHA" concept. The review's identity is the pair of branch
names; the diff is always against the current tip.

### 3. Scope is a multi-select list of commits, rendered as a range

The frontend lens shape is:

```elixir
@type lens() :: %{
        optional(:scope) => :all | {:commits, [String.t()]},
        optional(:worktree) => :diff | :staged | :unstaged
      }
```

- `:all` — render the full `base_ref...head_ref` merge-base diff.
- `{:commits, []}` — normalized to `:all`.
- `{:commits, [sha]}` — render just that commit's patch.
- `{:commits, [sha1, sha2, ...]}` — render `<oldest>^..<newest>` where
  `<newest>` is the first sha (the list is stored newest-first, matching
  the `/commits` endpoint's order) and `<oldest>` is the last.

The range diff is computed by `Suikou.Git.range_diff/4`, which falls back
to the empty-tree SHA (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`) when
the oldest commit is a root commit — the same trick `git show` uses under
the hood, composable into a range.

### 4. Worktree × non-empty commits is invalid

Preserved from [[BDR-0024-diff-review-live-lens-scope-and-worktree]] §3:
`{:commits, [_ | _]}` combined with `worktree ∈ {:staged, :unstaged}`
returns `{:error, :invalid_scope_worktree_combination}`. A historical
commit has no current worktree; the frontend enforces this by resetting
the worktree axis to `:diff` when a commit is picked, and clearing the
commits list when the worktree axis leaves `:diff`.

### 5. Vanished ref surfaces as an error page

`Reviews.refs_snapshot/1` returns
`%{base_ref, head_ref, refs_valid: boolean()}`. `refs_valid` is `false`
when either ref no longer resolves. When the frontend sees
`refs_valid: false` on a diff review, it renders an error page in the
content area (chrome stays visible so the reviewer sees the review's name
and can navigate back). Delete happens from the project board's per-review
kebab menu (already exists).

### 6. UI: Scope popover (desktop) / Files+Scope sheet (mobile)

The refs strip (worktree segmented control + commits popover from
BDR-0024) is deleted. A single Scope trigger lives in the file navigator
header on desktop and as a second tab in the mobile Files sheet. Both
open the same popover body:

```
┌─ Scope ─────────────────┐
│ Source:                 │
│   ● Diff                │
│   ○ Staged              │
│   ○ Unstaged            │
│                         │
│ Commits (16):    Clear  │  (visible only in Diff mode)
│   ☐ 0b068f1 dashboard   │
│   ☑ 084ab6b pi-agent    │
│   ☑ f3f0d73 skill       │
│   ...                   │
└─────────────────────────┘
```

## Rejected Alternatives

- **Pinned SHAs (B under §1)**: fights the reviewer's mental model of
  "branch = current tip"; the "refs moved" banner became noise.
- **Branch name + last-good SHA fallback (C under §1)**: silent drift
  is worse than a visible error.
- **Single-commit scope (B under §3)**: forces a mode switch to review a
  contiguous group of commits.
- **Full-screen ref-broken state (B under §5)**: strips useful context.

## Supersession

This BDR **replaces** the immutable-refs rule in
[[BDR-0020-git-diff-review-type]] §3 and the single-commit lens shape in
[[BDR-0024-diff-review-live-lens-scope-and-worktree]] §2. All other
BDR-0020 and BDR-0024 decisions (three-dot merge-base semantics,
`diff_hunk` anchor with quote re-anchoring, `Suikou.Git` no-shell adapter,
worktree × commits exclusivity, comment drift into the E16 stranded band
on lens switch) continue unchanged.

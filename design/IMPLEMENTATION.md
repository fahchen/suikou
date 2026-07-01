# Design implementation ledger

Tracks porting the approved mockups in `design/pages/` into the real React app
under `assets/src/`. Fresh loop workers read this file to pick the next surface;
the verifier reads it to confirm claimed progress. Update the status boxes as
work lands.

## Ground rules (apply to every item)

- **Translate, do not copy tokens.** Mockups use their own token names
  (`--bg-3`, `--accent-soft`, `--shadow-card`). The real app themes through
  `--color-*` variables in `assets/src/index.css` driven by `[data-theme]`
  across the 13 built-in themes (`assets/src/themes.ts`). Re-express the
  mockup's structure, spacing, and states using the **existing `--color-*`
  tokens**. Add a new token only when no existing one fits, and define it for
  every theme block.
- **Never break theming.** All 13 themes (5 light, 8 dark) and mobile reflow
  must keep working. No hardcoded hex/`#000`/`#fff`; use tokens. Verify a light
  theme and a dark theme both look right.
- **Follow `DESIGN.md` + impeccable.** No gradients on buttons/controls, no
  side-stripe borders, no gradient text, monochrome icons, OKLCH-tinted
  neutrals, 150-250ms state transitions.
- **Keep it green.** Before committing an item: `cd assets && bun run typecheck
  && bun run test && bun run build` must all pass. Do not weaken/skip tests to
  pass; fix the code.
- **Small commits.** One commit per surface, English message, no unrelated
  churn.
- Mockups are the visual authority; the specs (`spec.md`, `states.md`,
  `settings.md`) describe intent and states.

## Surfaces

Legend: `[ ]` todo, `[~]` in progress, `[x]` done + green + committed.

- [x] **1. Projects launcher** — `review/ProjectBoard.tsx` (+ `routes/index.tsx`).
  Mockups: `design/pages/projects/suikou-{dark,light}.html`,
  `suikou-{dark,light}-mobile.html`. Spec: `design/pages/projects/spec.md`.
  Monochrome kind glyphs (FileText / GitCompare), review-kind badges, empty
  state, mobile stack.

- [x] **2. Settings modal** — net-new component (none exists yet). Desktop =
  centered modal, mobile = bottom sheet. Mockups:
  `design/pages/settings/suikou-{dark,light}.html`. Spec:
  `design/pages/settings.md`. Panes: Appearance (theme picker over the 13 real
  themes from `themes.ts` — reuse/extend `ThemeMenu`), Review defaults, Keyboard
  cheatsheet, About 推敲. Wire a trigger from the top bar. Theme control drives
  `[data-theme]`.

- [x] **3. Review — file_selection view** — the review reading surface for
  `kind: "file_selection"`: `TopBar*`, `FileTree`/`ReviewFileTree`,
  `ArtifactReviewShell`, `CommentRail`/`CommentCard`, composer. Mockups:
  `design/pages/review/states-codex.html` (dark),
  `states-light.html`, `states-mobile.html`, `states-light-mobile.html`. Specs:
  `design/pages/review/spec.md`, `states.md`. Chrome, comment rail/card, and
  composer all render off the shared `--color-*` tokens with no gradients or
  side-stripes; the `MissingFilePrompt` header now shares the `ReviewBreadcrumb`
  helper with `TopBar` so the identity chip reads the same on the fallback
  screen. Further per-state polish (E6 resolved / E3 pending visual split,
  H2 review overview) is tracked in `states.md`'s "优先补的状态" list.

- [x] **4. Review — git_diff view** — the diff surface for `kind: "git_diff"`:
  `DiffRefsLine` (`base@sha..head@sha`), Files/Diff badges, `refs moved` amber /
  `branch deleted` red pills, split + unified diff, in-diff comment threads.
  Mockups: the J-group states in `states-codex.html` / `states-light.html` /
  mobile variants. Spec: `states.md` (review-kind axis).
  Landed: J1/J4/J7 chrome — `load_review_structure` serves a typed `refs`
  snapshot (backed by `Suikou.Reviews.refs_snapshot/1`), the workspace
  breadcrumb renders the compared refs plus amber "refs moved" / red "branch
  deleted" pills, and the file card gets a `RefsBanner` warning above the diff
  in both states. Unified/split diff layout, diff_hunk comments, and the
  hunk-range composer are live in `views/DiffView.tsx`. Per-file `+N/−M` stats
  now ride the shared `ReviewFileTree` row via a new `Suikou.Git.diff_stats/3`
  numstat walk plumbed onto `Reviews.list_files/1`; a zero-count side is
  skipped and both-null (binary files, non-diff reviews) collapses silently.
  Deferred: the "Re-diff refs" banner button stays decorative (marked with a
  `ponytail:` note) — a real re-diff needs a server-side flow and round
  semantics. J5 cross-round real diff, J6 submit polish, and J8 agent-reply
  lifecycle ride on generic surfaces already covered elsewhere.

## Done when

All four boxes are `[x]`, `typecheck` + `test` + `build` all pass, and the app
renders correctly in at least one light theme and one dark theme, desktop and
mobile widths.

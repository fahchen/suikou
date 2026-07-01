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

- [~] **3. Review — file_selection view** — the review reading surface for
  `kind: "file_selection"`: `TopBar*`, `FileTree`/`ReviewFileTree`,
  `ArtifactReviewShell`, `CommentRail`/`CommentCard`, composer. Mockups:
  `design/pages/review/states-codex.html` (dark),
  `states-light.html`, `states-mobile.html`, `states-light-mobile.html`. Specs:
  `design/pages/review/spec.md`, `states.md`. Match spacing, comment thread
  states, empty/loading/error, mobile bottom-sheet comments.
  Progress: audit shows chrome mostly already matches design tokens. Landed:
  breadcrumb (KindBadge + review name) in TopBar, shared `KindBadge` extracted
  from ProjectBoard, ChangeStatusIcon violet/teal → tokens. Remaining: verify
  in-browser against mockup page-by-page for spacing/state polish, port
  `MissingFilePrompt` header to use the same breadcrumb, sanity-check side
  vs inline comment layouts in each of the 13 themes.

- [ ] **4. Review — git_diff view** — the diff surface for `kind: "git_diff"`:
  `DiffRefsLine` (`base@sha..head@sha`), Files/Diff badges, `refs moved` amber /
  `branch deleted` red pills, split + unified diff, in-diff comment threads.
  Mockups: the J-group states in `states-codex.html` / `states-light.html` /
  mobile variants. Spec: `states.md` (review-kind axis).

## Done when

All four boxes are `[x]`, `typecheck` + `test` + `build` all pass, and the app
renders correctly in at least one light theme and one dark theme, desktop and
mobile widths.

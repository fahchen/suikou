# Fidelity ledger — raise the real app to match the mockups

The 4 surfaces are implemented and hydrate, but visual fidelity to the approved
mockups in `design/pages/` is too low. This loop closes the gap **per surface**:
match the mockup's exact spacing, typography (size/weight/tracking/line-height),
color, radii, borders, shadows, control shapes, iconography, and every state —
using the real `--color-*` token system so all 13 themes keep working.

## How to work (every iteration)

1. Read this file. Pick the FIRST surface still `[ ]` or `[~]`; mark it `[~]`.
2. **Compare visually.** The dev app is already running (do NOT restart it):
   - Real app: `http://localhost:4710` (prod build; rebuild with `cd assets && bun run build` after edits, then hard-reload).
   - Mockup: open the `file://` mockup HTML for that surface.
   Open BOTH in the browser (chrome-devtools-mcp), screenshot each at the same
   width, and diff them element by element. Note every gap (spacing off by Npx,
   wrong weight, wrong radius, missing hover/active, wrong gap, off color).
3. **Close the gaps** in the real components. Translate mockup CSS into the real
   `--color-*` tokens + Tailwind classes. Never hardcode hex, never `#000`/`#fff`.
   No gradients on buttons/controls, no side-stripe accent borders, monochrome
   icons. Keep the mockup's structure; do not invent.
4. Re-screenshot the real app and confirm it now matches the mockup. Iterate
   until the surface reads as the same design.
5. Gate before commit: `cd assets && bun run typecheck && bun run test && bun run
   build` — all green. Then mark the surface `[x]` (or `[~]` with a precise note
   on remaining gaps) and commit (small, English, no unrelated churn).

Rules: match `DESIGN.md` + the impeccable product register. bun only (never
pnpm). Repo content English-only. Don't hand-edit generated files
(`routeTree.gen.ts`, `generated/`). Don't restart the dev server or touch the
DB; use the seeded data below.

## Surfaces → mockup → route → component

Legend: `[ ]` todo, `[~]` in progress, `[x]` matches the mockup + green + committed.

- [x] **1. Projects launcher**
  Progress: toolbar (h50, gap9, seal/wordmark weights, search+kbd, primary button, brand→spacer→search→separator→settings→`+ New ▾` dropdown ordering to match the mockup), sidebar (bg-panel, group header font/tracking, row h34/font13, selected weight 600, folder icon 16, dashed add-row h34, N-projects footer), project header (name weight 700, gap tightening), rev-body padding/gap 9, NewReviewCard (r-panel13, dashed, size-30 plus, 25px pill chips bg-hover with inset ring), review row (r-panel13, kind box 34/rounded9/inset ring, meta gap-9 text2, MetaDot 2px opacity70, trailing r-open chevron 22px). Toolbar `+ New ▾` opens a menu with **New project…** and **New review from files/diff…** (the latter targets the currently selected project via `NewReviewRequestContext`). Explicitly out of scope for this pass because they require new server-side fields on the board contract: unread accent-dot column, approved-tag + blocker-count badges on review rows.
  Mockup: `design/pages/projects/suikou-dark.html` (+ `suikou-light.html`, `suikou-dark-mobile.html`).
  Route: `http://localhost:4710/` · Component: `assets/src/review/ProjectBoard.tsx`.

- [ ] **2. Settings modal**
  Mockup: `design/pages/settings/suikou-dark.html` (+ `suikou-light.html`).
  Route: `http://localhost:4710/` then press `⌘,` (or click "Open settings").
  Component: `assets/src/settings/SettingsModal.tsx`.

- [ ] **3. Review — file_selection view**
  Mockup: `design/pages/review/states-codex.html` (dark) / `states-light.html` / `states-mobile.html`.
  Route: `http://localhost:4710/reviews/019f2000-4439-7af9-a123-bfab4e3af3ca`.
  Components: `review/ArtifactReviewShell.tsx`, `TopBar*.tsx`, `CommentRail.tsx`,
  `CommentCard*.tsx`, `FileTree.tsx`/`ReviewFileTree.tsx`, composer.

- [ ] **4. Review — git_diff view**
  Mockup: the J-group states in `design/pages/review/states-codex.html`.
  Route: `http://localhost:4710/reviews/019f22a4-a8e7-7c92-8fb9-f74ba7f76044`
  (a real git_diff review; `bun.lock` is noise, inspect a source file's diff).
  Components: `diff-refs.ts`, the diff views, `ReviewFileTree.tsx`, `TopBarShell.tsx`.

## Done when

All four `[x]`, each surface visually reads as its mockup (spacing/type/color/
radii/shadow/states), `typecheck` + `test` + `build` green, and light + dark
themes both look right.

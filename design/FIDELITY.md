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
   Open BOTH in the browser and screenshot each at the same width, then diff
   them element by element. Note every gap (spacing off by Npx, wrong weight,
   wrong radius, missing hover/active, wrong gap, off color).
   **Screenshot with chrome-devtools-mcp only** (`mcp__plugin_chrome-devtools-mcp_chrome-devtools__new_page` / `navigate_page` / `take_screenshot`).
   **Do NOT use `agent-browser` — its screenshot command is broken (hangs, never
   writes the file). If you catch yourself retrying `agent-browser screenshot`,
   stop and switch to chrome-devtools-mcp `take_screenshot`.**
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

- [x] **2. Settings modal**
  Progress: modal h520→h488; header title 14→14.5 weight 600→700; close = filled square (bg-soft, hairline ring, XIcon 15) instead of ghost. Rail padding p2.5→py11 px9; row h32→h33 gap9; icon 14→16; group label 10→9.5. Content pane px6 py5 → pt18 px22 pb22; pane title 600→700; lede text-muted-foreground→text-faint leading 1.45; header-lede gap mt1→mt0.5. Control row py2.5→py11; label font-medium→font-[580] tracking-[-0.008em]; sub leading-snug→leading-1.4. Segmented h6→h22 px2.5→px11 with stronger inset shadow. Switch: bg-blue on with accent-edge/soft glow ring; off track uses bg-canvas/80 and knob bg-muted (was bg-faint). ThemePicker: h8→h30 rounded-lg→rounded-9 text12.5→text13 pl3 pr2.5; chevron muted-fg opacity70. About: seal 36→38 rounded11 with inset highlight + accent-soft glow (was elev-1); wordmark 20→22 font-bold; body text 13→14 leading 1.55; version `Suikou 0.1.0`.
  Mockup: `design/pages/settings/suikou-dark.html` (+ `suikou-light.html`).
  Route: `http://localhost:4710/` then press `⌘,` (or click "Open settings").
  Component: `assets/src/settings/SettingsModal.tsx`.

- [~] **3. Review — file_selection view**
  Progress (this pass): toolbar chrome now reads as the mockup's `.toolbar` — opaque `bg-panel` bar h=50, hairline `border-b border-line-strong`, inset highlight, gap[9px], no more transparent floating overlay. Breadcrumb rewritten to `suikou › [kind-icon] review-name ▾` (mockup `.tb-crumb` pattern with hover-bg, project label 13/540 muted, `›` sep, kind icon 13, name 13/640 heading, chevron 12/70%); replaces the previous `/ KindBadge name` chip. Right cluster now separates into three visual groups with hairline `TopBarSep` (mockup `.tb-sep`, h=22 w=1 line-strong): Round | (sep) | Display+collapse | (sep) | Submit. AllFilesShellHeader now passes the review breadcrumb (was absent). Review body padding tightened `pt-3 sm:px-5 lg:px-6` so it sits under the toolbar instead of floating below a 40px gap. Verified light + dark themes render the new chrome.
  Remaining scope (out of this iteration):
    - Persistent left navigator column (mockup shows a 236px `.navigator` column with `Files N-files` header, per-file A/M/D change-status glyph, verdict ✓, comment count badge, groups `NEEDS REVIEW / REVIEWED` with counters, and the `Reviewed 4/6 · Unresolved 3 · 1 blocker · Round 2` footer) — app currently only exposes the file list via the `FileSwitcher` popover off the burger. Adding it needs new routing/layout because both AllFilesShell + ArtifactReviewShell would need a `grid-cols-[236px_1fr_(300px?)]` shell and the `FileTree` refactored into a standalone `Navigator` component.
    - Status bar footer (`router.ex · Source · Round 2 · L13   connected`) — mockup has a persistent bottom bar per shell; app has none. Requires plumbing current path/view/round/line into a `StatusBar` component.
    - Default comment layout: mockup shows inline comments in editor body (E13); app defaults to right-rail (E14) for wide viewports. Flipping the default requires reviewing `ui.commentMode` default + `sideMode` gate in `ArtifactReviewShell`.
    - Landing hitting `/reviews/:id` currently renders `AllFilesView` (stacked), but the mockup A1b state redirects to the first file in single mode. Route redirect + `uiStore.fileDisplayMode="single"` default alignment.
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

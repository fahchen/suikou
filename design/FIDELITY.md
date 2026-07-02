# Fidelity ledger — pass 2: overflow + mobile & desktop parity

Pass 1 raised desktop structure toward the mockups. This pass:
1. **Hunt overflow bugs** on every surface — text that clips, truncates without
   an ellipsis, wraps ugly, overlaps a neighbor, or spills out of its container;
   any horizontal scrollbar; any element wider/taller than its box. Check at BOTH
   a desktop width and a narrow width, and with LONG content (long project paths,
   long review names, long file paths, long comment bodies, many themes).
2. **Match BOTH the mobile and the desktop mockups** — the app must read as the
   desktop mockup at desktop width AND as the mobile mockup at phone width.

Use the real `--color-*` token system (all 13 themes keep working). No hardcoded
hex / `#000` / `#fff`, no gradients on buttons/controls, no side-stripe accent
borders, monochrome icons. Match `DESIGN.md` + the impeccable product register.

## How to work (every iteration)

1. Read this file. Pick the FIRST surface still `[ ]` or `[~]`; mark it `[~]`.
2. **Screenshot at BOTH viewports** and compare to the matching mockup. The dev
   app is already running at `http://localhost:4710` (do NOT restart it; rebuild
   with `cd assets && bun run build` after edits, then hard-reload).
   - **Screenshot with chrome-devtools-mcp ONLY** — `mcp__plugin_chrome-devtools-mcp_chrome-devtools__new_page` / `navigate_page` / `resize_page` (or `emulate`) / `take_screenshot`. **Do NOT use `agent-browser` — its screenshot command is broken (hangs, never writes the file).**
   - Desktop: `resize_page` to ~1440×900, screenshot the real route + the desktop mockup.
   - Mobile: `resize_page` to ~390×844, screenshot the real route + the mobile mockup.
3. **Overflow hunt.** At each width, look for: clipped/overlapping text, a label
   with no `truncate`/ellipsis that should have one, text spilling past its
   container, a horizontal scrollbar, or any box overflowing. Reproduce with LONG
   content where relevant. Note every instance with the element + width.
4. **Close the gaps.** Fix overflow (add `truncate`/`min-w-0`/`overflow` guards,
   flex `min-w-0`, wrap rules, `text-ellipsis`) AND bring the layout to the
   mockup at that width. Keep the mockup's structure; do not invent.
5. Re-screenshot both viewports; confirm no overflow and both match. Iterate.
6. Gate: `cd assets && bun run typecheck && bun run test && bun run build` — all
   green (bun only). Don't hand-edit generated files. Then mark the surface `[x]`
   (or `[~]` with a precise note) and commit (small, English, no unrelated churn).

Don't restart the dev server or touch the DB; use the seeded IDs below.

## Surfaces → mockups (desktop + mobile) → route → component

Legend: `[ ]` todo, `[~]` in progress, `[x]` no overflow + matches desktop AND mobile mockup + green + committed.

- [x] **1. Projects launcher**
  Desktop mockup: `design/pages/projects/suikou-dark.html` (+ `suikou-light.html`).
  Mobile mockup: `design/pages/projects/suikou-dark-mobile.html` (+ `suikou-light-mobile.html`).
  Route: `http://localhost:4710/` · Component: `assets/src/review/ProjectBoard.tsx`.
  Overflow watch: long project name/path in sidebar + header, long review names.

- [x] **2. Settings modal**
  Desktop mockup: `design/pages/settings/suikou-dark.html` (+ `suikou-light.html`) — centered modal.
  Mobile: same mockup's bottom-sheet state; the app renders `MobileSheet` under `MOBILE_QUERY`.
  Route: `http://localhost:4710/` then `⌘,` (or "Open settings").
  Component: `assets/src/settings/SettingsModal.tsx`.
  Overflow watch: long theme names in the picker, control rows at narrow width, tab labels.

- [x] **3. Review — file_selection view**
  Desktop mockup: `design/pages/review/states-codex.html` (+ `states-light.html`).
  Mobile mockup: `design/pages/review/states-mobile.html` (+ `states-light-mobile.html`).
  Route: `http://localhost:4710/reviews/019f2000-4439-7af9-a123-bfab4e3af3ca`.
  Components: `ArtifactReviewShell.tsx`, `Navigator.tsx`, `StatusBar.tsx`, `TopBar*.tsx`, `CommentRail.tsx`, `CommentCard*.tsx`.
  Overflow watch: long file paths in Navigator, long breadcrumb/review name in the toolbar, long comment bodies, code lines (wrap vs scroll).
  Pass-2 progress: Navigator now carries the `nav-filter` row (search input + `/` shortcut) with live client-side filtering and renames the second meter to `Comments` (unresolved count in red when > 0, else `N this round`), matching the desktop mockup. TopBar collapses Round selector, collapse-all, Display menu, and the prev/next file pager behind `sm:contents` so the mobile app bar keeps only Home + breadcrumb + Submit/Copy, aligned with the mobile mockup's minimal `.appbar`. FileHeader density + markdown-flavor segments stay deferred (belong in Display menu; not shown at either mockup width for A1).

- [x] **4. Review — git_diff view**
  Desktop mockup: the J-group states in `design/pages/review/states-codex.html`.
  Mobile mockup: `design/pages/review/states-mobile.html` (J-group mobile).
  Route: `http://localhost:4710/reviews/019f22a4-a8e7-7c92-8fb9-f74ba7f76044` (inspect a source file's diff, not `bun.lock`).
  Components: `views/DiffView.tsx`, `diff-refs.ts`, `ReviewFileTree.tsx`, `TopBarShell.tsx`.
  Overflow watch: `base@sha..head@sha` refs line, long diff lines (split view horizontal scroll), long file paths.
  Pass-2 progress: per-file `+N/−M` deltas now render inside the file-head next to the path on both single-file (`FileHeader`) and stacked (`AllFilesView`) variants (mockup J1/M-J1/M-J2), threaded via a new `added`/`deleted` prop on `FileRenderHeader` and through `MergedFileView`. `DiffDeltas` is now exported from `ReviewFileTree` so both places share the same chip. Unified + split diff layouts pass no-horizontal-scroll at 1440 and 390, light and dark. Mobile top bar now collapses `ReviewBreadcrumb` into the mockup's two-line `.ab-title` layout — review name on top, kind-badge chip + mono `base..head` refs on the ctx row (mockup M-J1) — while desktop keeps the inline `suikou › [icon] name … refs` chip. Refs-pill (J4 amber `REFS MOVED`, J7 red `BRANCH DELETED`) shares one component; verified J4 at 390 in light+dark on the seeded review; J7 code path reuses the same layout (no seeded branch-deleted review exists to eyeball).

## Done when

All four `[x]`: no overflow at desktop OR mobile width (incl. long content),
each surface matches its desktop mockup at desktop width and its mobile mockup at
phone width, `typecheck` + `test` + `build` green, light + dark both correct.

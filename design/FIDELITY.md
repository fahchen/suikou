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

- [x] **3. Review — file_selection view**
  Progress (prior pass): toolbar chrome now reads as the mockup's `.toolbar` — opaque `bg-panel` bar h=50, hairline `border-b border-line-strong`, inset highlight, gap[9px], no more transparent floating overlay. Breadcrumb rewritten to `suikou › [kind-icon] review-name ▾` (mockup `.tb-crumb` pattern with hover-bg, project label 13/540 muted, `›` sep, kind icon 13, name 13/640 heading, chevron 12/70%); replaces the previous `/ KindBadge name` chip. Right cluster now separates into three visual groups with hairline `TopBarSep` (mockup `.tb-sep`, h=22 w=1 line-strong): Round | (sep) | Display+collapse | (sep) | Submit. AllFilesShellHeader now passes the review breadcrumb (was absent). Review body padding tightened `pt-3 sm:px-5 lg:px-6` so it sits under the toolbar instead of floating below a 40px gap. Verified light + dark themes render the new chrome.
  Progress (this pass): landed the four remaining chrome pieces so the single-file shell now reads as the mockup:
    - New `Navigator.tsx`: persistent 236px left column on `lg:` viewports — `bg-panel` + `border-r border-line-strong` + inset top highlight. Header `Files · N files` (12px/660 title, 11px muted count), `NEEDS REVIEW` / `REVIEWED` groups with per-group count and a hair line, file rows h=31/rounded-9/gap-8 carrying the octicon change-status glyph, monochrome file icon, filename (12.5px, tracking −0.006em, 600 weight when selected), comment-count badge (red-soft when the file has a blocker verdict or an unresolved thread), and the small `VerdictIcon` on approve/request_changes/comment. Footer meter shows `Reviewed X of N`, `Unresolved N` (red when > 0), and `Round N` — all `--color-*` tokens, no hex or gradients.
    - New `StatusBar.tsx`: fixed 29px footer with `[file icon] name · Preview|Source · Round N` on the left, connection LED (green with a subtle glow + soft ring, `--color-green`) plus `connected` / `reconnecting…` on the right. Row uses `bg-panel` + `border-t border-line-strong` + inset top highlight to match `.statusbar` in the storyboard.
    - `ArtifactReviewShell.HydratedReviewBody` restructured from a single scroll `<main>` into a `flex-col` shell: `TopBar` → row `[Navigator | scrollable main | (optional) CommentRail]` → `StatusBar`. The comment rail keeps its 340px column when `sideMode` is on; single-file skeleton was left as-is (still lacks the nav shimmer).
    - `uiStore.commentMode` default flipped from `"side"` to `"inline"` so a fresh open lands on the mockup E13 layout (inline comments in the editor body). localStorage overrides still restore returning users' preferred rail.
    - `/reviews/:reviewId` index now redirects to the first file (tree order) in `single` mode via `navigate({ replace: true })`, matching mockup A1b. Users who opt into `fileDisplayMode="all"` still hit the stacked `AllFilesShell`.
  Remaining polish (deferred, not blocking): AllFilesShell (`fileDisplayMode="all"`) still uses the pre-refactor single-column layout — no left Navigator, no StatusBar — because the mockup composes stacked cards very differently and the loop's default landing is `single`. A tiny filter box inside the Navigator header, the meter progress bars, and the settings gear in the nav footer were skipped in favour of shipping the layout end-to-end; they can layer on later without moving the shell.
  Mockup: `design/pages/review/states-codex.html` (dark) / `states-light.html` / `states-mobile.html`.
  Route: `http://localhost:4710/reviews/019f2000-4439-7af9-a123-bfab4e3af3ca`.
  Components: `review/ArtifactReviewShell.tsx`, `review/Navigator.tsx`, `review/StatusBar.tsx`, `TopBar*.tsx`, `CommentRail.tsx`, `CommentCard*.tsx`, `FileTree.tsx`/`ReviewFileTree.tsx`, composer.

- [~] **4. Review — git_diff view**
  Progress: pulled the Unified / Split segmented out of the buried Display-options menu and rendered it inline in the diff card's file-head (right cluster), matching the mockup `.file-head .seg`. Reuses `uiStore.diffLayout` so the top-bar menu and status bar stay in sync; on narrow viewports Split is disabled with a tooltip and the label reads `Unified` (matches DiffView's auto-fallback). StatusBar's middle segment now spells out `Unified diff` / `Split diff` for git_diff reviews (was still `Preview`/`Source`, which is a file-selection axis and read wrong on a diff review). Both changes render correctly in light + dark themes. Verified on route `.../019f22a4-a8e7-7c92-8fb9-f74ba7f76044/files/assets/src/review/ArtifactReviewShell.tsx`.
  Remaining gaps (deferred, need server-side data or larger structural work): per-file `+N / −M` add/delete counts in the Navigator rows and the nav footer total (`change_status` is on the structure entry but line counts are not — plumbing this needs a new server-side field on the diff-file rows); `Filter files…` box with `/` kbd in the Navigator header (skipped in surface 3 too — layer on later); nav footer settings gear; sticky `.file-head` letter-badge `M/A/D` swap (real ships GitHub-octicon change-status glyphs, kept consistent with surface 3 which is `[x]`); mockup's fixed hunk-header pill (`.hg` + `.ht` style) vs the plain grey header the current DiffView renders.
  Mockup: the J-group states in `design/pages/review/states-codex.html`.
  Route: `http://localhost:4710/reviews/019f22a4-a8e7-7c92-8fb9-f74ba7f76044`
  (a real git_diff review; `bun.lock` is noise, inspect a source file's diff).
  Components: `diff-refs.ts`, the diff views, `ReviewFileTree.tsx`, `TopBarShell.tsx`, `FileRenderHeader.tsx`, `StatusBar.tsx`, `ArtifactReviewShell.tsx`.

## Done when

All four `[x]`, each surface visually reads as its mockup (spacing/type/color/
radii/shadow/states), `typecheck` + `test` + `build` green, and light + dark
themes both look right.

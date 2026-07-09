# Progress Log

## Session 2026-07-07

### Mobile file switching planning
- Investigated the current mobile review navigation path.
- Current implementation:
  - desktop file tree is hidden below `lg`
  - mobile uses the editor header "Open file list" button
  - that opens the existing Files bottom Dialog with `FileList`
  - selecting a file closes the sheet and navigates through the existing `select(path)` route update
- Planning decision:
  - keep the Files sheet as the full search/tree fallback
  - add low-friction previous/next file controls for sequential mobile review before doing the full #25/#31 app-bar rewrite
  - record this as a new prioritized backlog item ahead of the larger mobile shell pass
- No implementation changes were made in this planning pass.

### Mobile file switching first slice implemented
- Added mobile-only previous/current/next controls to the review file head in `ReviewPage.tsx`.
- The `N/M` position button opens the existing Files sheet; previous/next reuse `Shell.select(path)` so route state
  and `suikou-file:<reviewId>` persistence stay centralized. The file label is display-only and truncates separately.
- Refined the mobile header after visual review: the `N/M` control is now a ghost text button with a chevron instead
  of a bordered pill, and mobile view modes use a dropdown while desktop keeps the existing segmented controls.
- Verified with `agent-browser` at `390x844` on
  `/reviews/019f2f9f-490c-7a72-bc03-6914211c08c9`: first file shows Previous disabled, chip `1/14`, Next enabled;
  clicking Next updates the chip to `2/14`; clicking the chip opens the Files sheet.
- Verified desktop at `1440x900`: the left file navigator remains visible and the mobile previous/current/next controls
  are hidden.
- Browser errors: none captured by `agent-browser errors --clear`.
- Static checks: `git diff --check` passed. `pnpm typecheck` and `bun run typecheck` are blocked by the current local
  dependency install state: TypeScript cannot resolve `vite/client`, `vite-plugin-pwa/client`, `vitest/globals`, and
  `@testing-library/jest-dom` type entries. `pnpm build` is also blocked because the local `vite` binary is missing
  from `node_modules/.bin`.

## Session 2026-07-05

### P4 diff work started
- Committed the refactor as `6a0cb53` (`refactor: split review and board components`).
- Updated `task_plan.md` so P4 is now the current selected feature task after
  the refactor goal.
- Started the backend contract read for D6/D7 / J1-J8:
  - confirmed git-diff review content is generated live by `DiffSource.read/1`
    through `Suikou.Git.file_diff(base...head, path)`
  - confirmed `Artifacts.content_source/1` and
    `AssetController.file_content/2` already expose `text/x-diff`
  - confirmed `ReviewStore.load_review_structure` already reports `kind: :diff`
    and ref/SHA metadata
- Initial P4 direction: do not add a backend endpoint for the first diff-renderer
  pass; route existing `text/x-diff` responses in the frontend into
  `@pierre/diffs`.
- Checked current `assets/package.json`: `@pierre/diffs` is not installed yet.
- Checked Context7 docs for the diff renderer:
  - `PatchDiff` from `@pierre/diffs/react` can render directly from a patch
    string
  - `parsePatchFiles` exists for later metadata-oriented work
- Next implementation step: add `@pierre/diffs`, introduce a small diff content
  branch for `text/x-diff`, and render it with `PatchDiff` before adding custom
  anchor mapping.

### Refactor completed and verified
- Completed the frontend component extraction goal and marked the thread goal
  complete.
- Final refactor shape:
  - `assets/src/review/ReviewPage.tsx`: 877 lines
  - `assets/src/board/ProjectsBoard.tsx`: 260 lines
  - `assets/src/review/components/ReviewChrome.tsx`: 326 lines
  - `assets/src/review/components/ReviewPanels.tsx`: 434 lines
  - `assets/src/review/components/EditorSurface.tsx`: 119 lines
  - `assets/src/review/components/HtmlSurface.tsx`: 359 lines
  - `assets/src/review/components/EditorBodies.tsx`: 465 lines
  - `assets/src/board/components/ReviewPane.tsx`: 292 lines
  - `assets/src/board/components/ProjectNavigation.tsx`: 183 lines
- Agent-browser happy path verification:
  - desktop board opened and linked into `Approved review`
  - desktop review page rendered toolbar, file list, inline comments, Review
    popover, Submit popover, and Display options
  - desktop Side mode rendered the right Comments rail and statusbar `side rail`
  - mobile 390x844 rendered inline comments, file-list sheet, and Submit sheet
- Fixed one refactor regression found by browser testing:
  - `ArtifactComments` still used `MessageSquare`, but the lucide import had
    been dropped during extraction
  - restored the import in `assets/src/review/ReviewPage.tsx`
- `agent-browser errors` was empty after the desktop and mobile retests.
- `bun run typecheck` still fails before project type checking because the local
  dependency state is missing configured type packages:
  `@testing-library/jest-dom`, `vite/client`, `vite-plugin-pwa/client`, and
  `vitest/globals`.

### Refactor goal continued
- Continued the business-component extraction instead of switching to a new
  feature task.
- Finished the remaining editor-body split:
  - extracted `assets/src/review/components/EditorBodies.tsx`
  - moved the source and markdown review bodies there
  - removed the now-dead draft helper copies from `assets/src/review/ReviewPage.tsx`
- Continued the board-page split:
  - extracted `assets/src/board/components/ReviewPane.tsx`
  - moved the selected-project header, project actions, review rows, and review
    actions out of `assets/src/board/ProjectsBoard.tsx`
- Continued the review-chrome split:
  - extracted `assets/src/review/components/ReviewPanels.tsx`
  - moved submit flow, submit confirmation, review overview, blocker list, and
    verdict-summary helpers out of `assets/src/review/components/ReviewChrome.tsx`
- Current file sizes after the latest pass:
  - `assets/src/review/ReviewPage.tsx`: 877 lines
  - `assets/src/board/ProjectsBoard.tsx`: 260 lines
  - `assets/src/review/components/ReviewChrome.tsx`: 326 lines
  - `assets/src/review/components/ReviewPanels.tsx`: 434 lines
  - `assets/src/review/components/EditorBodies.tsx`: 465 lines
  - `assets/src/board/components/ReviewPane.tsx`: 292 lines
- Refactor outcome so far:
  - `ReviewPage.tsx` is now mostly page wiring, layout, and render-kind routing
  - `ProjectsBoard.tsx` is now mostly root loading, cache refresh, and dialog
    orchestration
  - reusable comment behavior remains centralized in
    `assets/src/review/components/comments/` rather than being forked into new
    surfaces
- Validation status for this pass:
  - full `pnpm typecheck` failed because the local frontend environment is still
    missing type libraries such as `@testing-library/jest-dom`, `vite/client`,
    `vite-plugin-pwa/client`, and `vitest/globals`
  - full `pnpm build` failed because `vite` is not available in the current
    dependency state
  - ad-hoc `pnpm exec esbuild` checks were likewise blocked by unresolved local
    package dependencies (`react`, `lucide-react`, router, Base UI, etc.)
- Next refactor target:
  - `ReviewChrome.tsx` is now down to the actual toolbar/status/verdict shell
  - `EditorSurface.tsx` is now down to generic outline / mime / image / binary
    helpers, while html-specific behavior moved to `HtmlSurface.tsx`
  - keep future comment-bearing work on top of the shared `comments/` components
    instead of creating another comment implementation

### Review component extraction resumed
- Resumed the paused frontend refactor and switched from planning back to code.
- Extracted the review comment stack out of `assets/src/review/ReviewPage.tsx` into
  `assets/src/review/components/comments/`:
  - `shared.ts` for shared comment types, critique metadata, compact labels, and
    localStorage keys
  - `CommentCard.tsx` for the shared inline/side shell
  - `CommentThread.tsx` for inline / markdown / html thread rendering
  - `SideCommentCard.tsx` for expanded side-rail cards
  - `Composer.tsx`, `Reply.tsx`, `CommentActions.tsx` for reusable comment subparts
- Extracted the side rail into `assets/src/review/components/SideRail.tsx`, keeping
  the current Notion-style anchored layout behavior intact.
- Extracted the file navigator into `assets/src/review/components/FileNavigator.tsx`
  so `ReviewPage.tsx` now only wires selection state and live review data into the
  navigator instead of owning the tree rendering itself.
- Extracted the review chrome into `assets/src/review/components/ReviewChrome.tsx`:
  - toolbar
  - review summary popover
  - round selector
  - submit panel / confirm flow
  - per-file verdict chip
  - status bar
- Extracted another editor surface slice into `assets/src/review/components/EditorSurface.tsx`:
  - html iframe/comment surface
  - image view
  - binary notice
  - empty-file notice
  - outline menu
  - shared `clampZoom()` / `isTextMime()` helpers for the editor shell
- Started the same container split in the board page:
  - extracted mobile project switcher, project picker sheet, and desktop project
    sidebar into `assets/src/board/components/ProjectNavigation.tsx`
  - reduced `assets/src/board/ProjectsBoard.tsx` from 726 lines to 546 lines
- Result: `assets/src/review/ReviewPage.tsx` dropped from 2839 lines to 1405 lines
  while moving most review-specific UI surfaces into adjacent component files.
- Lightweight validation:
  - esbuild bundle checks passed for `FileNavigator.tsx`, `SideRail.tsx`,
    `CommentThread.tsx`, `SideCommentCard.tsx`, `ReviewChrome.tsx`, and
    `EditorSurface.tsx`
  - full `pnpm`/`tsc` gates remain blocked by the existing offline `.ignored/`
    frontend dependency state, so full type/build verification is still an
    environment issue rather than a newly introduced code failure.
- Next extraction target: the remaining source / markdown editor bodies; after
  that, the remaining board review-list/actions cluster can be split the same
  way.

### P4 planning updated
- Updated the P4 plan to lock the diff renderer choice to `@pierre/diffs`.
- Recorded the new implementation direction:
  - backend/store research remains necessary, but only to source or reconstruct
    patch data
  - unified/split diff rendering should be built on the package's React surface,
    not on a new in-house diff parser/viewer
- Recorded one follow-up webapp-shell task for later polish: add global
  `overscroll-behavior-y: none` on `html, body` to suppress bounce/rubber-band
  scrolling in the webapp.
- Recorded one more cross-cutting task decision: file-change watching should use
  `fs_notify` (`https://github.com/fahchen/fs_notify`) instead of a separate
  watcher approach.

### Comment card unification + collapse polish
- Unified inline and side comments onto a shared `CommentCard` in
  `assets/src/review/ReviewPage.tsx`, then committed that cleanup as `451bcd8`
  (`refactor: unify review comment cards`).
- Moved inline and side comments onto the same header/body/replies/actions
  structure so future spacing and state tweaks land in one place.
- Polished the collapsed header behavior:
  - line labels shortened to `14L` / `14-21L`
  - pending now surfaces as the same amber dot pattern used elsewhere
  - collapsed summary is single-line, truncated, and visually de-emphasized
  - header gap and collapse affordance were tightened
  - inline collapse state persists through reloads
- Side summary/header treatment now matches the shared comment header semantics
  instead of carrying a separate pending badge model.
- Remaining work in this area is visual cleanup only; the functional E14/H1-H4
  display-mode loop is already implemented and committed.

### Side-rail interaction pass complete
- Finished the E14/H1-H4 side-comment interaction pass and committed it as
  `a922cee` (`Refine side review comment interactions`).
- Removed the side-rail global collapse/expand toggle; collapse is now purely
  per-group.
- Collapsed all groups by default, including single-comment groups. Group
  summaries are one line and surface pending count in the header.
- Changed group logic from "same start line" to "overlapping ranges merge under
  the earliest start line".
- Changed interaction model:
  - hover = preview + highlight only
  - click = full expand
  - only one expanded group at a time
  - clicking another collapsed group switches in one click
  - expanded comments are immediately interactive (reply/edit/delete/resolve)
- Fixed side-card header duplication: expanded cards now show one range label
  (`L16-21`) instead of repeating the line number twice.
- Browser spot checks on review `019f2f9f-490c-7a72-bc03-6914211c08c9` confirmed:
  - desktop side rail shows single-line collapsed summaries
  - single-comment groups also collapse
  - mobile stays inline with no right rail
- Validation gap remains: full TS verification was not rerun because the local
  frontend dependency tree is still in the prior offline `.ignored/` state.

### Phase 6 verification pass
- Browser re-verified the three display modes on the same acceptance review:
  - `side`: right rail present; only collapsed summaries visible by default
  - `hidden`: no right rail and no inline thread cards
  - `inline`: inline thread cards and per-file verdict chip return
- Browser re-verified mobile (390×844): no right rail; inline thread flow remains usable.
- Tooling check confirmed the TS runtime is still stranded at
  `assets/node_modules/.ignored/typescript/bin/tsc`, so local type/build gates are
  currently environment-blocked rather than newly code-blocked.

### Resumed right-panel task
- Recovered interrupted session `3deaeb1d`; current code already removed the
  persistent desktop review overview rail and added a toolbar Review popover.
- Cleaned the stale Inspector comment in `assets/src/review/ReviewPage.tsx`.
- Verified `pnpm typecheck` and `pnpm build` from `assets/` both exit 0.
- Browser/eval verified live fixture "Approved review": desktop shell is two
  columns (`236px 1044px`), no persistent overview rail is present, and the
  Review popover opens with verdict, blockers, and round stats.
- `mix precommit` failed on an unrelated existing smell-check finding in
  `lib/suikou/reviews/reviews.ex` (repeated map shape at lines 485/501/515);
  this frontend task did not touch that file.

### Planned E14/H1-H4 comment display modes
- User selected the full `inline / side / hidden` scope.
- Added the implementation plan to `task_plan.md`.
- Key decision: full three-mode UX, but implementation proceeds in phases:
  display control → layout/thread suppression → side rail MVP → anchor/focus
  affordances → fold states/polish → verification.
- Explicitly out of scope for this task: all-files side rail, git_diff side rail,
  backend changes, and reintroducing a persistent overview inspector.

### Implemented comment display settings + side rail MVP
- Added `uiStore.commentDisplay` with persisted `inline | side | hidden` modes.
- Added Settings > Review defaults > Comments segmented control.
- Wired review shell layout: inline/hidden = two desktop columns; side = navigator/editor/340px comments rail.
- Side/hidden modes suppress inline source/markdown thread cards; side mode shows current-file comments in a right rail.
- Side rail cards sort file comments first, then line anchors; clicking a line card scrolls and highlights the anchored line/block.
- Browser verified on "Approved review": Settings control exists; Side mode gives `236px 704px 340px`, rail visible, no inline Reply buttons; Hidden mode gives `236px 1044px`, no rail, no inline Reply buttons.
- `pnpm typecheck` and `pnpm build` passed.
- `mix precommit` still fails on the existing unrelated repeated-map-shape smell
  in `lib/suikou/reviews/reviews.ex`.

### Restored side-comment interaction continuity
- Re-read the E14/H1-H4 plan plus mockup references for the side rail. The intended rail is a Notion-style
  anchored comments column, not a plain ordered list.
- Added a toolbar Display options popover with inline/side/hidden controls, while keeping Settings as defaults.
- In side mode, hid the editor header verdict chip so per-file verdict controls do not compete with the right-side
  rail affordances or visually collapse the comment layout.
- Reworked side rail cards to absolute-position near their anchored line, with a small stacking guard so crowded
  nearby comments do not overlap. Collapse-all now folds non-focused cards to one-line summaries.
- Removed the visible "Focused" status text; focus is represented by the rail card ring and the corresponding
  editor line highlight.
- Browser verified desktop side/hidden/inline continuity and mobile forced-inline behavior. `pnpm typecheck` and
  `pnpm build` passed. `mix precommit` still fails on the existing unrelated repeated-map-shape smell in
  `lib/suikou/reviews/reviews.ex`.

## Session 2026-07-04

### Done
- Adopted the planning-with-files workflow; created `task_plan.md`, `findings.md`, `progress.md`.
- Recorded the phase plan and pulled the unfinished work from history into `task_plan.md`:
  - Done: Board, Review P1 (shell + read-only render), P2 (composer core) — all committed.
  - Unfinished: **P3** render types (D2–D5, D8, D9, D10, D11), P4 rounds + git_diff (A5–A7, D6/D7, J1–J8), G verdict/submit (G1–G8), Ecomplete lifecycle depth (E5–E16, H1–H4), Frest (F3, F7).
- Attempted a projects-board mobile redesign (chip strip, slim app bar, prominent New review button + kind sheet, grouped review card, empty state) + a desktop New review card. **Reverted at user request** — board design was already finalized in git history; the mockup was stale. `git restore assets/src/board/ProjectsBoard.tsx`, working tree clean.
- Saved the "no desktop New review card" decision to memory.

### Decisions
- Desktop review pane: no in-pane New review card (mockup stale).
- Board mobile design is already settled in committed history; do not re-derive from the mockup.

### Composer refinement
- Textarea now auto-grows with content, capped at max-height 240px then scrolls
  (`useLayoutEffect` sets height=auto→scrollHeight; `resize-none`, `min-h-[58px]`,
  `max-h-[240px]`, `overflow-y-auto`). Verified in browser: 5 lines → 110px,
  30 lines → capped ~238px with scroll. typecheck ✓.

### In flight
- Background subagent researching P3 render-type mockups (D2–D11), the previous
  implementation's techniques, and whether the store exposes per-artifact render
  kind + content. Awaiting its report before building D2.

### Comment/reply action tweaks
- Thread actions (Edit/Delete, Reply) now right-aligned (`justify-end`). Suggestion (F7) button excluded — not built yet.
- Pending replies are now editable/deletable (were read-only). Backend already had
  `edit_reply`/`delete_reply` (comments_store.ex:58-67); wired `Reply` to show
  you/PENDING + Edit/Delete for `status==="pending"`, edit swaps to a prefilled
  reply composer. Verified: render + edit-prefill + delete (server-authoritative,
  persists). typecheck ✓.

### Mobile review (assessment)
- Review page is responsive + functional on mobile (390px): slim app bar, file-head
  with navigator toggle + outline, full-width highlighted source, full-width inline
  threads (right-aligned actions, pending-reply edit/delete works), status bar.
- Gap: the DEDICATED mobile mockup `design/pages/review/states-light-mobile.html`
  (bottom-sheet file navigator, mobile statusbar, reactions, touch polish) is a
  separate unbuilt phase — the current page is responsive-desktop, not yet matched
  to that mobile mockup. Track as phase "P-mobile".
- Tooling note: agent-browser tab drifts to the ttyd dev terminal (:7681) on
  `location.reload()`; drive nav in one batch, avoid reload, or `pkill -9 -f agent-browser` to reset.

### Discard-confirm rule unified (edit/reply)
- Composer discard-confirm now guards on **has-text** (`body.trim().length>0`), not
  "changed" — so the Cancel rule applies to edit/reply too: Cancel button = direct
  discard; Escape (and future click-away) = confirm whenever there's text, incl. an
  unchanged edit. Confirm copy → "Discard unsaved changes?" (universal). Verified in
  isolated session: reply+Escape confirms; edit prefilled + Escape unchanged confirms;
  ⌘⏎ submit works; delete cleans up. typecheck ✓ / build ✓.
- agent-browser isolation: use `--session suikou-verify` to avoid colliding with the
  user's other agent-browser instances (that was the cause of the :7681 tab drift).

### Reply draft persistence
- Reply composer now takes `draftKey={`suikou-reply:${comment.id}`}` so an unsent
  reply survives a refresh: type → persists to localStorage; reopen Reply on that
  comment → restores. Submit/Cancel/Discard clear it. (No auto-reopen like the line
  composer — user reopens manually.) Verified isolated: type→reload→reopen restores
  "persist me"; Cancel clears the key. typecheck ✓ / build ✓.

### P3 D2 markdown preview (first cut)
- `markdown.ts`: `renderMarkdownBlocks(src)` splits a doc into top-level blocks
  (nesting-balance scan) each with a 1-based start line + rendered HTML.
- `index.css`: `.md-doc .md-body` doc prose (headings/table/blockquote/hr/img),
  scoped so comment bodies are untouched. Blockquote uses a bg tint, not a side-stripe.
- `ReviewPage.tsx`: `previewable` (.md/.markdown), `view` state (Preview default for
  md, resets per file), `Segmented` Source/Preview toggle in the file head,
  `MarkdownPreview` (2-col grid: line gutter + `.md-body` block).
- Verified in isolated session against a temp review (README.md on the "Suikou (self)"
  project, id 019f2ca4-4849-701e-b5a9-eaeae2fe9a46): Preview renders headings/lists/
  code/gutter; Source toggle shows highlighted raw md. typecheck ✓ / build ✓.
- Deferred (D2 depth): density/flavor controls; block-level comment anchoring in preview.
- NOTE: temp README.md review kept for acceptance — delete when done.

### D2 review fixes
- Preview fills the container (removed max-width/centering), matching Source width.
- Multi-line blocks show their line range with a connecting vertical line in the
  gutter (start line top, hairline, end line bottom via `renderMarkdownBlocks` endLine
  = token.map[1]); single-line blocks show one number. Verified: "3⋮5", "11⋮15".
- Point 3 (comment + show comments in Preview = block-level anchoring) deferred to
  task #23. typecheck ✓ / build ✓.

### D2 more fixes (view persist + TOC + source-style gutter)
- Preview gutter now matches Source: narrow `(digits+2)ch` left column, right-aligned
  numbers, content `flex-1` fills the rest.
- Source/Preview choice persists (`localStorage suikou-md-view`, default preview);
  survives reload and carries to the next markdown file (entry effect reads the pref).
- Markdown TOC: `markdownToc(src)` pulls headings (level/text/line) from markdown-it
  (tree-sitter has no md grammar); wired for .md so the Outline menu shows in both
  Source and Preview. Verified: TOC lists Suikou/Develop/…; Source choice persists reload.
- typecheck ✓ / build ✓.
- html rendering (D3/D4/D5) confirmed to the user as a later task.

### P3 D8/D9 image + binary (committed `1b336a7`)
- `ReviewPage.tsx`: `Content` non-text branch split into `{kind:"image",url,mime,bytes}` and
  `{kind:"binary",mime,bytes}` (from HTTP content-type + content-length). svg stays text
  (isTextMime unchanged) so only raster hits the image view.
- `ImageView`: centered `<img>` on a checker backdrop (`repeating-conic-gradient` of bg-2/bg-1),
  holder = rounded-12 + hair-strong border + float shadow; caption `name · W×H · size · FORMAT`
  (dims captured from img onLoad naturalWidth/Height). No zoom, no anchors (artifact scope).
- `BinaryNotice`: lucide `Binary` icon badge + "Cannot render this file" + explanation +
  meta pill `name · size · mime`. (Mockup used a 📦 emoji; swapped to lucide for app consistency.)
- `formatBytes` (1024-based, 1-decimal <10).
- Verified in isolated browser (light): new review "D8 D9 image and binary" (id
  019f2cc0-847e-725c-8d23-0f28b6533861) with priv/static/icon-192.png (D8) +
  tree-sitter-json.wasm (D9). D8 caption `icon-192.png · 192×192 · 3.6 KB · PNG`;
  D9 pill `tree-sitter-json.wasm · 6.1 KB · application/wasm`. typecheck ✓ / build ✓.
- NOTE: temp reviews kept for acceptance (README.md D2 review + this D8/D9 review) — delete when done.

### D10 wrap + D11 empty-file
- D10: Source already honors `uiStore.codeWrap` (ReviewPage.tsx:891 whitespace-pre-wrap vs
  whitespace-pre); toggle lives in SettingsModal (persisted WRAP_KEY). Confirmed — no code change.
  Refinement deferred: mockup wants a toolbar "Display options" popover for it.
- D11 empty-file: added "This file is empty." branch (lines===[""]). Committed `d2c3dbc`.
- D11 stacked-all-files: deferred → task #26 (big layout, overlaps G per-file verdict chip).

### P3 status
- Done: D2 (markdown preview), D8 (image), D9 (binary), D10 (wrap), D11-empty.
- Remaining P3: D3/D4/D5 html (task #22 — iframe sandbox/comment/interactive/zoom, the big one),
  D11-stacked (#26).

### task #23 markdown preview block comments (committed `88fb0a3`)
- `MarkdownPreview` now takes comments/fileProxy/commentsProxy/draftScope and is an `observer`.
- Gutter per block is a `<button>` (title "Comment on this block"); hover fades the number(s)
  and shows a `Plus`; click → `requestOpen({start:block.line,end:block.endLine})` → `Composer`
  (reused) anchored to the block range, dispatches add_comment scope:located line_range.
- Show: `threadsByBlock` buckets each located comment to the block containing its start_line
  (fallback: last block with line<=start, else 0); anchored block highlighted `bg-accent-soft`;
  `Thread` cards (reused) render beneath. Discard-confirm on switching blocks (switchTo + ConfirmDialog).
- Verified isolated browser (light): clicked block "3–5" on README review → composer "line 3–5" →
  typed + Add → pending FIX_REQUIRED thread renders under the block; reload → re-anchors from
  snapshot (server-authoritative, not just optimistic). typecheck ✓ / build ✓.
- Left one demo pending comment on the temp README review (throwaway, marked delete-when-done).

### Preview comment bug fixes (committed `8fbb601`)
- Reported: (1) preview comment "gone after reload"; (2) can't drag-select multiple lines.
- Bug #1 root cause: comment DID persist server-side — but a `?file`-less reload (board open /
  bare URL) landed on the first file (EMPTY.md), hiding a comment left on README.md. Single-file
  README review "worked" only by luck. Fix: persist selected file to `localStorage suikou-file:<id>`
  on select; `selectedPath` falls back URL param → remembered → entries[0]. Verified: bare URL now
  restores README.md + its PENDING comment.
- Bug #2: preview only had whole-block click. Added drag + shift-click across block gutters
  (`data-review-block={index}`, window pointermove hit-test via elementFromPoint, same as Source),
  committing {start: firstBlock.line, end: lastBlock.endLine}. Composer renders after the last
  block of the span; all spanned blocks highlight. Verified: drag block 7→11-15 → composer "line 7–15",
  blocks 7/9/11-15 highlighted. typecheck ✓ / build ✓.

### Preview composer reopen-on-reload (committed `d15a975`)
- Reported: new preview comment with unsaved text → reload didn't reopen the input.
- Cause: preview persisted the body (draftKey) but not the OPEN anchor, so reload orphaned it.
  Source had the openKey restore; preview skipped it. Fix: mirror Source's `suikou-composer:<scope>`
  openKey — `open` writes it, `close` clears it, a mount effect reopens the composer (scroll to
  block.start) when the stored anchor still hasDraftBody. Shared key ⇒ also carries across the
  Source/Preview toggle. Verified: type in block 20 → bare-URL reload → composer reopens with text.

### Stale restored-draft guard (committed `18d1284`)
- Reported: after reload the composer reopens, but clicking to comment prompts "Discard unsaved
  comment?" — a stale/unlocatable cached draft lingering invisibly and blocking new comments.
- Per user rule "cache out of file range or unlocatable → discard": both restore effects now drop
  the cached draft (openKey + draftBodyKey) unless the anchor is still locatable — Preview: a block
  with endLine===stored.end && line>=stored.start; Source: stored.start>=1 && stored.end<=count.
- Verified: injected line-999 draft → reload drops it + clears both keys → clicking a block opens
  cleanly (no phantom prompt). Locatable block-7 draft still restores (no regression). typecheck ✓ / build ✓.

### D3/D4/D5 html render shell (committed `9cba7cc`)
- `htmlFile` = /\.html?$/i. Renders `HtmlView`: sandboxed `<iframe srcDoc>` (sandbox=allow-scripts
  allow-forms allow-popups allow-modals — deliberately NO allow-same-origin, so the framed page
  can't reach this app; safe combo). Comment mode = pointer-events:none (inert for annotation);
  Interactive = pointer-events:auto + hint banner. Zoom via `width/height:${100/z}% + scale(z)`
  origin top-left, clamped 10%–200% (clampZoom). Fullscreen = frameRef.requestFullscreen. Sandbox
  tag chip overlay (shows "· interactive" in interactive mode).
- File-head: html shows Comment/Interactive Segmented + zoom (−/%/+) + fullscreen (replaces the
  md Source/Preview seg; TOC hidden for html). State (htmlMode/htmlZoom) resets on file change.
- Verified isolated browser: TEST.html review (id 019f2cfb-...) — Comment mode inert render +
  sandbox tag; zoom→60% scales whole page; Interactive → hint banner + live + "· INTERACTIVE" tag.
  typecheck ✓ / build ✓. (Fullscreen button wired to Fullscreen API, not visually verified headless.)
- Deferred → task #27: element hover outline + dot comments + F3 element composer + E15 popover
  (iframe script injection + postMessage; `element` anchor type {selector,quote} exists in types).

### html element anchoring — task #27 authoring (committed `21d003e`)
- Bridge approach (sandbox has no same-origin → parent can't read contentDocument): Comment-mode
  srcDoc appends `<script>` (htmlAnchorScript(accent)) that on hover paints `.suikou-hover` dashed
  outline, on click posts `{source:"suikou-html",kind:"pick",selector,quote}` (capture + preventDefault
  so links don't fire), and outlines `.suikou-anchored` selectors the host posts. Selector = id-wins
  else tag:nth-of-type walk joined ` > `; quote = textContent squished, ≤200.
- Host `HtmlView` (now observer, takes comments/fileProxy/draftScope): validates event.source ===
  iframe.contentWindow; on pick → element composer (selector chip + quote box + reused `Composer`
  anchorLabel "this element", draftKey suikou-eldraft:...) → add_comment {scope:"located",
  anchor:{type:"element",selector,quote}}. Posts anchoredSelectors on "ready" + whenever comments change.
- iframe pointer-events now always auto (comment mode needs events for the script; script intercepts).
- Verified isolated browser: click "Client" → composer selector `div > div:nth-of-type(1) > h3` +
  quote "Client" → Add → element outlined; reload → outline persists (server-authoritative);
  Interactive → outline gone + page live. typecheck ✓ / build ✓.
- Deferred → task #28 (E15): dot count badge + popover expand + element-thread reply/resolve.

### html element comment UX redesign — task #28 E15 (committed `32cf8ed`)
- User asked for 4 changes: (1) comment as overlay beside/below the element; (2) interactive hint →
  info-button tooltip; (3) commented element = breathing dot (not outline), hover = translucent
  rounded tint (not dashed); (4) only one comment open, clicking another collapses prior to its dot.
- Injected script now: `.suikou-hi` tint (color-mix accent 15% + inset ring, rounded), `.suikou-dot`
  pulsing (keyframes box-shadow ring) drawn per anchored selector in a `.suikou-dots` layer, placed
  by getBoundingClientRect on scroll/resize. Click: dot/anchored el → post `open{selector,rect}`;
  else `pick{selector,quote,rect}`. Streams tracked el's `rect` on scroll so host repositions.
- Host HtmlView: single `overlay` state (compose|thread) → createPortal fixed div at
  frameRect+rect*zoom (clamped), tracks el via `track` msg. compose = Composer; thread = Thread(s)
  (added optional `className` to Thread) filtered by selector. New `components/ui/tooltip.tsx`
  (Base UI Tooltip wrapper) for the info button.
- BUG fixed: the injected `.suikou-dots` body child shifted `selectorFor`'s :nth-of-type, breaking
  match with pre-existing anchors → selectorFor now skips `suikou-`classed siblings.
- Verified isolated browser: Client dot (breathing) + click → thread "Rename this card to Frontend."
  with Edit/Delete; click Store → tinted highlight + compose overlay below (selector+quote); opening
  one closes the other; info-button hover → tooltip. typecheck ✓ / build ✓.

### html element-comment overlay/controls refinement (committed `7706a13`)
- 7 user asks: (A) html Source view; (B) info tooltip inside the Interactive segment; (C1) drop the
  pulsing dot; (C2) opaque overlay comment; (C3) merge the 3-box compose overlay into one card; (C4)
  hovered selector at screen top-right; (D) type dropdown hidden behind overlay + selector nth-of-type(0).
- A: htmlMode now source|comment|interactive; source → `<Source>` (highlighted markup); zoom/fullscreen
  hidden in source. B: Segmented labels take ReactNode → Interactive = "Interactive" + Info(Tooltip);
  removed the standalone info button. C1: `.suikou-dot` static (accent + near-white ring + shadow, no
  keyframes). C2/C3: overlay = one opaque `bg-surface` card (header selector+close, then quote+chromeless
  Composer, or Thread(s)); added `chrome` prop to Composer. C4: script posts `hover{selector}`; host shows
  a fixed top-right badge (`!overlay`). D: overlay z-40 < dropdown z-50 so the type menu floats above;
  selectorFor bug — it excluded the hovered element (has `suikou-hi` class) from its own siblings → skip
  only the dots `layer` node now.
- Verified isolated browser: Source→highlighted markup; Interactive ⓘ tooltip; Store click → one opaque
  card (selector `div > div:nth-of-type(2) > h3` correct), type menu opens above; hover Agent → top-right
  `div > div:nth-of-type(3) > h3`. typecheck ✓ / build ✓.

### html comment overlay polish batch 2 (committed `f3bee5a`)
- A: unified Source-vs-rendered pref — `suikou-doc-view` key ("source"|"rendered") shared by md
  (Source/Preview) + html (Source/Comment); readDocView/writeDocView; chooseHtmlMode persists.
  Verified: html→Source then open README → README opens Source.
- C4: hover selector badge moved into the frame top-left (absolute, dark pill mirroring the sandbox
  tag), not a screen-fixed portal.
- dot: radial-gradient sheen + soft accent glow halo (color-mix GLOW/SHEEN), hover intensifies — no pulse.
- thread popover: shows the element `quote` (threadQuote from openThreads[0].anchor); `Thread` got a
  `compact` prop → its edit composer renders chromeless (chrome=false + m-0) so it fits the 340px popover
  instead of inheriting the source gutter's ml-14.
- Verified: Client thread shows quote "Client" + FIX_REQUIRED/PENDING + Edit→full-width edit composer;
  hover Agent → top-left `div > div:nth-of-type(3) > h3`; dots glow. typecheck ✓ / build ✓.
- Note: comment/reply states (resolved/outdated/drifted, agent/human replies) render via Thread/Reply
  in the popover; only the ones present in test data were eyeballed — a full states gallery needs seeded data.

### html annotation layer moved to the parent (committed `ea56d45`, ping dot in `f3bee5a`→superseded)
- User: the comment annotation layer (highlight box + dots) should float OUTSIDE the iframe. Also wanted
  a Tailwind-`ping` pulse (motion.dev is React, unusable inside the iframe).
- Rearchitected: injected script NO LONGER mutates the page DOM (no style, no dots layer). It only
  hit-tests + reports geometry — `hover{selector,rect}`, click `pick|open{selector,quote,rect}`, and
  `rects{items:[{selector,rect}]}` for all anchored selectors, all restreamed on scroll/resize.
- Parent HtmlView renders the annotation layer inside the frame (absolute inset-0, pointer-events-none):
  hover highlight box (`bg-accent-soft` + `ring-accent-edge`, theme-aligned) at `rect*zoom`; dots as
  pointer-events-auto buttons at each anchored `rect.right/top*zoom` using Tailwind `animate-ping` +
  `bg-accent` (proper ping + theme color). Element clicks pass through (overlay pointer-events-none) to
  the iframe → pick; dot clicks open the thread in the parent directly. Composer/thread stays a body portal.
- Benefits: page DOM untouched → selectorFor stable (no suikou-node pollution); dots use real Tailwind
  ping + theme tokens. Verified: dots float aligned; hover Store → theme highlight box + top-left selector
  pill `div > div:nth-of-type(2) > h3`; click Store → compose; click dot → Client thread. typecheck ✓ / build ✓.

### html element compose restore-on-reload (committed `642903f`; dot shrink `f166b71`)
- User: after reload, a selected element with an unsubmitted comment should reopen (like line/block).
- Needs the element's rect after reload (parent can't read the iframe). Flow: `elDraftKey` holds the
  body (Composer draftKey); new `suikou-elopen:<scope>` holds {selector,quote}; `applyOverlay` writes/
  clears it on compose/close. HtmlView is now `key={entry.path}` (remounts per file); `pendingRestore`
  is LAZY-INIT (seeded on mount, before the frame's ready) from elopen+hasElDraftBody. trackSel =
  overlay?.selector ?? pendingRestore?.selector; on iframe `ready` the host re-posts `track` (trackRef),
  the script streams the rect, and the `rect` handler opens the compose for the pending selector.
- Killed an ordering bug: a persist-effect removed elopen on mount before a restore-effect read it →
  replaced both with lazy-init + explicit applyOverlay writes.
- Verified: type on Agent → reload → compose reopens pinned to Agent (`div > div:nth-of-type(3) > h3`),
  quote "Agent", text "Element draft that should survive reload." intact. typecheck ✓ / build ✓.

### html zoom persist (`cc7a481`) + mode-toggle no-reload (`ea6c316`)
- Zoom: `suikou-html-zoom` key; htmlZoom lazy-init from it; chooseZoom persists; dropped the per-file
  reset so it carries across files + reloads. Verified 60% survives reload.
- Comment/Interactive no longer reloads the iframe (was rebuilding srcDoc per mode). Now the bridge
  script is ALWAYS injected (srcDoc depends only on source); an `active` flag (toggled by a `mode`
  message) gates its hover/click interception. Leaving Comment clears the parent annotation; returning
  re-posts anchors so dots redraw. ready handler posts mode+anchors+track using refs. Verified: filled
  the iframe form in Interactive → toggled Comment↔Interactive → value persisted (no reload); dots
  return in Comment. typecheck ✓ / build ✓.

### dot final size + theme color (`1b4c06c`→`5beb61f`)
- Dot iterated 11→6→4→12→8px; final **8px** on `bg-accent` (theme-reactive), 18px hit area, white ring,
  ping halo, cursor-pointer, hover scale. Verified theme reactivity: rose-pine → purple dot, suikou-dark → teal.

### SESSION END (pre-compact) — RESUME HERE
- Working tree clean; all code committed (last `5beb61f`). Untracked: planning docs + temp EMPTY.md/TEST.html.
- **P3 done** except #26 (D11 stacked-all-files). Next: user to pick #26 vs a new phase (P4 rounds/diff, G verdict).
- Temp to clean when done: repo-root EMPTY.md + TEST.html; temp dev-DB reviews (P3 render acceptance 019f2cd2,
  Design mockups 019f2d7c, D8/D9 019f2cc0, README 019f2ca4, TEST.html 019f2cfb).
- html element-comment architecture (final): parent-side annotation layer (highlight box + Tailwind-ping
  dots) over the iframe; injected script = hit-test + geometry only (no DOM mutation); `mode` message
  toggles interception so Comment/Interactive don't reload; compose/thread = body-portal overlay; drafts
  persist+restore across reload (elopen key + rect round-trip); zoom + source/rendered pref persisted.

### Next
- P3 render types all present + html element commenting fully polished. Remaining P3 depth: #26 (D11 stacked).
  Then P4 (rounds/diff), G (verdict), Ecomplete, Frest.
- Deferred: #24 (overview→statusbar), #25 (P-mobile), #26 (D11 stacked), #29 (Motion+Base UI).
- Temp for cleanup: repo-root EMPTY.md + TEST.html; temp reviews (P3 render acceptance 019f2cd2 [now
  has an element comment on TEST.html], D8/D9 019f2cc0, README 019f2ca4, TEST.html 019f2cfb) — delete when done.

### Gates
- typecheck ✓, build ✓ during the (now reverted) board work. No vitest suite.

### SESSION (Phase G + mobile) — 2026-07-05
- **Phase G desktop DONE + verified** (commit `08db78a`): G1 verdict chip (set_draft_verdict), G3 submit
  popover (rollup verdict), G4 soft gate, G5 confirm, G6 dismiss (chip menu, dismiss_approval), G7 copy
  menu (→markdown), G8 nav blocker badge + inspector blocker list + statusbar unresolved, H2 inspector
  overview. Live off snap.body.files (no reload lag). New primitive `components/ui/popover.tsx`.
- **Phase G mobile DONE** (commits `90aaffc`, `455364a`): submit panel → bottom sheet (reuses responsive
  Dialog) with an OPEN BLOCKERS list so the overview is reachable without the right rail; extracted shared
  SubmitPanel + BlockerList; verdict chip collapses to icon-only below sm. Verified light on 390px.
- Verified on dev-board fixtures (CLI hits a SEPARATE daemon DB — must use dev fixtures): "G6 approved
  fixture" 019f25d8, "Approved review" 019f25a5 (published fix_required → G4/G8/threads). Files sheet,
  threads, statusbar all good on mobile.
- Gates: typecheck ✓, build ✓.
- **Mobile #25 remaining:** app bar is not yet the mockup's exact layout (mockup = back arrow + `.ab-round`
  pill + overflow `.ab-icon`; current keeps logo + explicit Copy/Submit/Settings — functional, arguably
  better UX). The `.ab-round` round pill needs P4 (multi-round) first. Composer (P2) already touch-capable
  (task #14). Decision pending: pursue pixel-exact app bar (after P4) vs treat mobile core as sufficient.

### SESSION cont. — Frest + P4 (2026-07-05)
- **Frest done**: F7 Suggest code block (`b997e9e`) — composer Suggest button inserts ```suggestion fence seeded
  with anchored source; markdown.ts fence rule → "Suggested change" add-row card (escaped). Verified: compose
  in-browser, render via bun renderMarkdown + live DOM ("Suggested change field :email, :string, default: \"\"").
- **P4 A4–A6 done** (`31dda13`): RoundSelector (toolbar, select_round, lists round_summaries w/ open counts),
  read-only past rounds (superseded strip, statusbar/selector "read-only", verdict chip + file-comment button
  hidden, line/block composers guarded via requestOpen). StatusBar shows Round N. Verified eval on 019f25a5.
- Round data: ReviewBodyStore.round_summaries/selected_round/latest_round + ReviewStore.select_round. readOnly =
  selected_round < latest_round.
- **agent-browser**: restarted per user; eval/DOM queries work, but `screenshot` does NOT write files in this env
  (tooling issue, not app). Use eval/DOM assertions for verify.
- NEXT: A7 round compare bar. Then diff (D6/D7/J) — needs backend research (diff content source).

### SESSION cont. — E14 Phase 6 verification closed (2026-07-06)
- Re-verified desktop side mode on `019f2f9f-490c-7a72-bc03-6914211c08c9` with `agent-browser`.
- Confirmed the merged first-line groups render as intended in side mode:
  - `line:14` collapsed summary shows `9 8 pending L14 FIX 123`
  - single-comment groups still collapse to one-line summaries
- Confirmed expanded side comments are directly interactive (`Reply`, `Resolve`, `Edit`, `Delete`)
  without an extra focus click.
- Confirmed gutter-only highlight behavior in source mode:
  - line 14 gutter button background becomes `bg-accent-soft`
  - sibling row / code content background stays transparent
- Confirmed mobile fallback behavior by forcing
  `localStorage["suikou-comment-display"] = "side"` and reloading in a `390x844` viewport:
  narrow layouts still render inline and do not show the right rail.
- Confirmed one-click expanded-group switching works against the live DOM when exercised with
  selector-based browser clicks (`line:14` → `line:28` collapsed group switches directly).
- No code changes were needed in this pass; this was a verification/cleanup closure before moving
  on to P4 diff / git_diff research.

## Session 2026-07-09

### Toolchain repair + board persistence
- **TOOLING-BLOCKED RESOLVED**: prior sessions reported typecheck/build blocked by an offline `.ignored/` /
  broken-pnpm node_modules state. Fixed this session with `bun install` (90 packages). `bun run typecheck` and
  `bun run build` both pass now. All earlier "tooling blocked / environment-blocked" notes are stale — gates are green.
- Removed repo-root pnpm cruft (`node_modules/`, `.pnpm-store/` at the worktree root, which has no package.json;
  only `assets/node_modules` is the real one and is gitignored).
- `assets/bun.lock` is left MODIFIED (uncommitted): `bun install` re-resolved the local `file:../deps/` musubi/phoenix
  transitive trees (~152 lines). Tooling side-effect, not a feature change — user to decide keep vs `git checkout`.
- Committed the in-flight board change as `01fe48d` (Remember the selected project on the board across reloads):
  persist `suikou-board-selected-project` in localStorage, restore on load, fall back to the first project. Verified
  the persistence key is written on the live dev board.
- NEXT: P4 diff (D6 `text/x-diff` → @pierre/diffs PatchDiff) is fully teed up (backend contract confirmed in findings.md,
  no new endpoint needed).

### Mobile app bar (#7 / P-mobile) — done
- Overscroll baseline: `overscroll-behavior-y: none` on html/body (`221b852`).
- Toolbar reshaped into the mockup mobile app bar below `lg` (commits `e3c34bd`, `054a3cc`):
  - brand badge → back chevron; round selector → full pill.
  - two-line title: review name over a Files/Diff kind line.
  - one overflow `⋯` menu holds Compare + Settings; the standalone Settings button is desktop-only.
  - Submit intentionally kept as a visible button (not buried in the overflow), per user pick (option a).
  - desktop (`lg+`) toolbar unchanged: explicit Compare / Round / Settings / Submit + S badge.
- Confirmed already-done mobile bits: comment actions are `opacity-100` on mobile (only `md:group-hover`
  gates desktop) so touch works without hover; submit/files/statusbar are bottom sheets; file prev/next exists.
- Verified via eval at 390px (bar 52px, two-line title, ⋯ = Compare+Settings) and 1280px (S badge, flat toolbar).
- Not done (deliberate): project-name crumb in the title, and folding Submit into the overflow — left as options.

### E7/E8 Re-anchor flow (Source) — done (`91a1ae7`)
- `CommentThread` gains an `onReanchor?` prop; when a comment is `outdated || drifted` it renders a Crosshair
  "Re-anchor" action next to Edit/Reply.
- `Source` (EditorBodies.tsx) arms a `relocating` comment id on Re-anchor: a sticky banner ("Click a line to
  re-anchor this comment · Cancel") shows; Escape or Cancel disarms. The next gutter pick (single line, drag
  range, or shift-range) routes through a new `commitRange` that dispatches `relocate_comment`
  ({comment_id, anchor:{type:"line_range",start_line,end_line}}) instead of opening a new composer.
- Dispatch shape verified against the generated client + backend `relocate_comment` contract (exact match).
- No-regression check: `commitRange` falls through to the original `requestOpen` when not relocating; the
  shift-click range-extend path was reverted to its original `open()` (it needs an existing draft, never
  reachable during relocation). Verified LIVE on review 019f253e/config.exs: a real pointerdown/up on a line
  gutter still opens the composer (normal authoring unbroken).
- Gates: typecheck ✓, build ✓. No console errors on load.
- VERIFICATION GAP (honest): the relocate happy-path was NOT clicked through on a live outdated comment.
  Dev fixtures are broken (many reviews 404 their files: "Approved review" etc.), and no pre-existing
  outdated *code-file* comment exists to exercise it. Manufacturing one (create review over a temp file +
  edit to break the quote) hit repeated agent-browser friction (React-controlled checkbox not registering
  eval `.click()`, stale snapshot refs, lazy-mint DB lag). Two throwaway reviews created during the attempt
  were deleted from `suikou_dev.db` (cascade); temp file removed. Left for a manual click-through or a
  seeded outdated fixture.
- NEXT (Ecomplete continues): MarkdownPreview re-anchor parity (2nd requestOpen in EditorBodies), E16 stranded
  (threadsByLine clamps out-of-range anchors to the last line — should surface at top w/ re-anchor), then
  full-stack E12 reactions (schema + migration + add/remove_reaction commands + recompile client + picker UI).

### MarkdownPreview re-anchor + E16 stranded — done (`2bfce48`)
- Extended the same `relocating`/`commitRange`/banner/Escape flow into `MarkdownPreview` so block comments can
  be re-anchored by picking a new block; `CommentThread` there now gets `onReanchor`.
- E16: `threadsByLine` now separates comments whose `start_line > count` (file shrank past the anchor) into a
  `strandedComments` list rendered as a top band ("Stranded comments · anchor line no longer exists"), each with
  re-anchor, instead of clamping them onto the last line.
- Gates: typecheck ✓, build ✓. Verified LIVE (no-regression): a block-gutter pointer pick still opens the
  markdown composer; no console errors.

### E12 reactions (full-stack) — code-complete (`bcbf2df` backend, `2b563d9` frontend)
- Product decision (user pick 2026-07-09): human **and** agent can react; reactions carry an `actor` and counts
  can exceed 1 — deliberately extends BDR-0018. Only the human path is wired now (UI store command); schema +
  rendering already support `:agent`. See task_plan Decisions.
- Backend (via elixir subagent, reviewed): `Suikou.Schemas.Reaction` (emoji enum thumbs_up/check/eyes/tada/heart/
  pray + actor enum, unique `(comment_id,emoji,actor)`), migration `20260709142805_create_reactions.exs` (already
  migrated into the worktree dev DB), `Suikou.Critique.Reactions` (react_as_human idempotent `on_conflict: :nothing`,
  unreact_as_human `delete_all`), facade `react_as_human`/`unreact_as_human` + `broadcast_reaction_change`, reads
  preload `:reactions`, `render_reactions/1` (group→{emoji,count,mine}, canonical order), contract field, store
  `add_reaction`/`remove_reaction` commands. Backend tests: 34 passed (incl. human+agent 👍 → count:2/mine:true).
  Musubi client regenerated (`reactions: Array<{emoji,count,mine}>` + both commands).
- Frontend: `Reactions.tsx` (chips w/ counts, self-reacted highlighted, add button reveals 6-emoji tray; toggles
  add/remove_reaction), new `reactions` slot on `CommentCard` (after body), wired in `CommentThread`. Gates:
  typecheck ✓, build ✓.
- **BLOCKER — live E2E not done**: the running dev node (`:4710`) went to HTTP 500 / "Loading…" after the
  subagent recompiled under the pinned OTP29 toolchain while the live node runs Erlang 28 (`mise run dev`'s
  orchestrator exited 143). The dev env needs a clean **`mise run dev` restart** (the reactions migration is
  already applied to `suikou_dev.db`, so no re-migrate). After restart, live-verify: reactions render + toggle
  (count/mine update server-authoritatively) AND the E7/E8 re-anchor + E16 stranded flows on an outdated comment.

### Dev restart + reactions live-verified + 3 follow-up tweaks (2026-07-10)
- Restarted `mise run dev` (killed the orphaned OTP28 node holding :4710, fresh clean boot on the pinned OTP29).
  **Reactions E2E verified LIVE** on 019f2f9f: add 👍 → chip count/mine, persists across reload (server-authoritative),
  toggle off removes it. Dev-DB reactions table returns to 0 rows after cleanup.
- **Reaction picker → popover** (`ac0e873`): moved the six-emoji tray from an inline in-flow div into the shared
  Base UI `Popover` (anchored, floats, dismiss on outside/Escape). Verified: picker portals outside the card, pick
  toggles + closes.
- **File picker alignment** (`35c1778`): `NewReviewDialog` file rows indented the whole button by `pl-[30px]`,
  pushing file checkboxes right of folder checkboxes. Now the checkbox stays in the shared left column and only the
  file icon is indented by the chevron width. Verified: dir+file checkboxes both at x=392, file icons under folder
  icons, nesting still indents.
- **Reply reactions (full-stack)** (`f2ee365` backend, `47dc475` frontend): user pick — each reply can also carry
  reactions. Reshaped `reactions` to be polymorphic (nullable comment_id/reply_id, DB check exactly-one, two partial
  unique indexes; SQLite needed the check inlined as a column CHECK and `on_conflict` as an unsafe_fragment with the
  index's WHERE). Added `react_reply_as_human`/`unreact_reply_as_human` + `add_reply_reaction`/`remove_reply_reaction`
  commands; replies render `reactions` in the snapshot. Frontend: `Reactions` generalized to target comment|reply,
  shown under published replies only. Backend 15 reaction tests pass. Verified LIVE on 019f2f9f round 3: ❤️ add/remove
  on a published reply, DB clean after.

### Reaction redesign: human/agent vocab + single-select + agent CLI verb (2026-07-10)
- **Vocabulary reworked** (many design iterations, see task_plan Decisions). Disjoint sets: Human = approval/opposition
  scale `💯 strong_agree · 👍 agree · 👎 disagree · ❌ strong_disagree`; Agent = work status `👀 eyes · 🤔 thinking ·
  ✅ check`. Dropped tada/heart/pray; renamed thumbs_up→agree. Actor-scoped validation (each actor may only use its
  own set — enforced in the changeset). Backend `emojis/0`/`human_emojis/0`/`agent_emojis/0`. 445 tests pass.
- **Single-select** (`reactions_one_per_actor` migration): unique index changed from `(target, emoji, actor)` to
  `(target, actor)`; `react_*` now `on_conflict: {:replace, [:emoji, :updated_at]}` so a new emoji REPLACES the old;
  `unreact_*` deletes by `(target, actor)`. 37 reaction tests pass. Verified LIVE: picking 👍 over 💯 replaces it.
- **Frontend**: `shared.ts` new emoji map + `HUMAN_REACTIONS`/`AGENT_REACTIONS`. `Reactions.tsx` — human picker lists
  only the 4 approval emoji; agent-set chips render read-only with a `Bot` avatar (frontend derives "agent" from the
  emoji set, since sets are disjoint — no snapshot flag). Human chips are emoji-only (count dropped — single reviewer).
- **Agent reaction path** (`react_as_agent`/`unreact_as_agent` facade + `AgentCLI.Comments.react`/`unreact` +
  `packaging/launcher.ts` `comment react`/`unreact` verbs). Verified E2E via `mise run cli -- comment react <id>
  --emoji thinking` → chip flips 👀→🤔 in the board; `--emoji agree` (human key) rejected ("emoji not allowed for
  this actor"); `unreact` clears. Skill updated in BOTH `~/.claude/skills/suikou/SKILL.md` and the repo's
  `packaging/embed/skill.md` (they must be hand-synced — see memory `suikou-skill-two-copies`).
- **Acceptance fixture**: dev-board review "Reaction demo" `019f4908-1fd6-736e-8b0a-bd1b51d3b334` (mix.exs) — 3
  comment types, agent+human replies, one human + one agent reaction per comment, plus a reply reaction. Seeded via
  `/tmp/reaction_demo.exs` (idempotent).

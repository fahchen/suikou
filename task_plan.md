# Task Plan: Rebuild the React frontend from the design mockups

## Goal
Reproduce the Suikou review-app frontend (`assets/`) 1:1 from the design mockups,
state by state, against the server-authoritative Musubi runtime — breadth first
(all states present), then depth.

## Current Phase
Resumed 2026-07-05: finished the interrupted task to remove the persistent
desktop right-side review overview rail and expose the H2 overview through the
toolbar Review popover instead. Scope is intentionally narrow; E14 side-comment
mode remains future work. Frontend typecheck/build and browser/eval verification
passed. `mix precommit` was attempted and failed on an unrelated backend
smell-check finding in `lib/suikou/reviews/reviews.ex`.

Current selected feature task: **Phase P4 — D6/D7 diff + J1–J8 git_diff implementation planning**.
The side-comment display-mode work is verified end-to-end on desktop and mobile,
and the component refactor track is complete. Resume P4 on top of the smaller
page containers.

Parallel maintenance track complete: **frontend business-component extraction**
inside `assets/src/review/` so the remaining feature work lands on smaller modules.
Current completed slices:
- comment system moved to `components/comments/`
- side rail moved to `components/SideRail.tsx`
- file navigator moved to `components/FileNavigator.tsx`
- review chrome moved to `components/ReviewChrome.tsx`
- review submit/overview panels moved to `components/ReviewPanels.tsx`
- editor surface helpers moved to `components/EditorSurface.tsx`
- html review surface moved to `components/HtmlSurface.tsx`
- source / markdown bodies moved to `components/EditorBodies.tsx`
- board navigation moved to `assets/src/board/components/ProjectNavigation.tsx`
- board review pane moved to `assets/src/board/components/ReviewPane.tsx`

Refactor-track exit state:
1. `ReviewPage.tsx` now acts as the container/orchestrator rather than the owner
   of every review surface
2. `ProjectsBoard.tsx` now acts as the board container rather than the owner of
   review-list rendering and actions
3. future comment-bearing work should keep building on the shared
   `components/comments/` stack instead of introducing another implementation
4. after this refactor goal, resume P4 diff work on top of the smaller page
   containers

Cross-cutting implementation decisions now recorded for later tasks:
- P4 diff rendering uses `@pierre/diffs`
- filesystem change watching uses `fs_notify` (`https://github.com/fahchen/fs_notify`)

## Prioritized Backlog (2026-07-07)
1. Ecomplete comment lifecycle depth: open/resolved, outdated, drifted, stranded; reactions stay last unless
   product need changes.
2. P-mobile #25/#31: finish the mobile app bar and bottom-sheet submit/overview shell, keeping comment actions
   usable without hover.
3. P3-D11 stacked-all-files mode, including comment grouping and interaction with the per-file verdict chip.
4. P4-J diff comment anchoring: map `diff_hunk` comments onto rendered diff lines using the shared comment
   components; introduce `parsePatchFiles` only if rendered-line metadata is actually needed.
5. P4-D6: render `git_diff` reviews with `@pierre/diffs` `PatchDiff` from the existing unified patch payload.
   Keep this as the smallest useful diff viewer before adding custom anchor logic.
6. P4-D7: add unified / side-by-side display switching on the same diff payload. If the library path is not
   straightforward, defer split view instead of building a second renderer.
7. P4-J refs/status states: surface refs moved / branch deleted / unavailable diff states from the existing review
   metadata.
8. P4-J cross-round diff behavior and diff submit edge cases after the renderer and anchors are stable.
9. Small maintenance: add the overscroll CSS rule; use `fs_notify` only when starting file-change-driven work.

### E14/H1-H4 Implementation Plan
- [x] Phase 1 — display-mode state + settings control
  - Add `CommentDisplayMode = "inline" | "side" | "hidden"` in the review shell.
  - Persist globally in localStorage; default is `inline`.
  - Add Settings > Review defaults > Comments segmented control.
  - Status bar shows `side rail` or `comments hidden` when not inline.
  - Mobile stays inline visually because the side rail is desktop-only.
- [x] Phase 2 — wire layout and suppress inline threads
  - Shell grid becomes `236px 1fr` for inline/hidden and `236px 1fr 340px` for side.
  - Pass display mode into editor renderers.
  - Inline mode: existing `Thread` rendering remains unchanged.
  - Side/hidden modes: line and markdown inline threads do not render in the editor.
  - Keep composers usable in inline mode first; side-mode new-comment authoring can still
    start from gutter and render the composer inline unless a cleaner reuse path is obvious.
- [x] Phase 3 — side rail MVP
  - Add `SideRail` for the selected file with header: Comments, count, collapse-all, switch-to-inline.
  - Flatten current file comments into cards sorted by anchor line; artifact comments come first.
  - Card content: type pill, line/anchor summary, body preview, latest reply preview, reply count.
  - Clicking a card scrolls to its anchor line/block and marks it focused.
  - Focused card expands; non-focused cards clamp to a compact preview.
- [x] Phase 4 — editor anchor affordances
  - In side mode, code/markdown anchors keep a small type-colored gutter dot/line marker.
  - Focused side card highlights the corresponding code line/block.
  - Hidden mode keeps no inline thread cards and no rail; comment anchors may keep subtle dots only
    if they do not clutter authoring.
- [x] Phase 5 — fold states and parity polish
  - Added toolbar Display options popover for inline/side/hidden so mode switching is not buried in Settings.
  - In side mode, hid the editor header per-file verdict chip so verdict work does not compete with the rail.
  - Side cards now use a Notion-style anchored rail: card tops track line anchors and stack only enough to avoid
    overlap in crowded rails.
  - All side-rail groups now default to collapsed, including single-comment groups.
  - Grouping now merges overlapping line ranges by their first line, not just exact same-line anchors.
  - Collapsed summary is one line and shows total count, pending count, anchor line, type, and first preview.
  - Hover only previews and highlights; click fully expands one group at a time; clicking another group switches
    directly in one click.
  - Expanded side comments are immediately interactive (reply/edit/delete/resolve) without a second focus step.
- [x] Phase 6 — verification
  - `pnpm typecheck` / `tsc --noEmit` remain blocked by the local offline dependency state
    (`assets/node_modules/.ignored/...` after the earlier failed pnpm reinstall).
  - `pnpm build` not rerun in this pass for the same reason.
  - Browser/eval desktop verified:
    - `side` shows collapsed summaries only, including single-comment groups
    - `inline` restores inline thread cards and keeps the per-file verdict chip
    - `hidden` removes both rail and inline thread cards
    - Review / Submit shell still renders normally
    - side-rail summary hover/click highlights only the gutter / line marker area,
      not the code content block
    - switching from one expanded side group to another works in one click when
      exercised against the live DOM with selector-based browser actions
  - Browser/eval mobile verified:
    - no right rail
    - forcing persisted `commentDisplay = "side"` still renders inline on narrow viewports
    - current inline behavior remains usable
  - `mix precommit` still intentionally deferred; known unrelated smell-check failure may still block full green.

Implementation notes:
- Reuse existing `Popover`, `Segmented`, `Thread`, critique type colors, and anchor helpers.
- Avoid backend changes; this is a frontend display-mode task over existing comment snapshots.
- Do not implement all-files side rail or git_diff side rail in this task; those belong to D11-stacked
  and P4 diff work.
- Do not reintroduce a persistent overview inspector. H2 remains toolbar Review popover.

Phase P4 (multi-round + git_diff) — **A4–A7 DONE**. RoundSelector + read-only past rounds (`31dda13`), A7
round-compare bar (`eabb803`: Compare toggle → resolved/new/open counts from comments' authored_round/resolved_round
+ verdict). Verified via eval on 019f25a5 (rounds 0/1/2; compare "Round 1→2, 0 resolved/3 new/0 open, Approve").
**NEXT (P4 remaining): D6/D7 diff (unified/side-by-side) + J1–J8 git_diff-only states** — renderer choice is now fixed:
use `@pierre/diffs`. The remaining unknown is the backend diff payload shape: whether we can fetch raw unified patch
content directly, or need to reconstruct a patch string / pre-parsed file metadata from existing review APIs. Do that
backend contract read first, then adapt the payload into `@pierre/diffs` React components. Frest done (F7 `b997e9e`).
Screenshots broken in agent-browser this env (eval works). Phase G below is DONE + accepted.

## Phase G (done)
Phase G (verdict/submit) — **DONE + accepted by user** (desktop + mobile, incl. a full review-feedback
round). Commits `08db78a`→`27068a6`. Post-accept refinements: verdict-only chip (note split out); E2
**ArtifactComments** band (file-level comments, multiple, editable, draft-persist, scrolls above line 1,
opened from a file-head button); submit radio is a selectable local confirmation (default = rollup ?? comment,
submit_review still carries no verdict); approve always submittable, comment/request need pending content;
clipboard execCommand fallback for http/Tailscale; nav row shows the real verdict icon; Submit moved to the
toolbar's right edge; Copy menu removed. Acceptance review in dev DB: **019f2f9f** (13 shots + zh guide
`design/acceptance/PHASE-G-REVIEW.md`), tailscale `http://philz-m1.tail73adf.ts.net:5173/reviews/019f2f9f-...`.
`mise run cli -- <args>` drives the dev node (needs the gitignored `packaging/embed/server.tar.gz` placeholder).
NEXT: user to pick — P4 (rounds/diff, also unblocks the mobile round pill), Ecomplete, or #25 full mobile app bar.

## Historical Phase G note
Phase G (verdict/submit) — **DESKTOP DONE + verified**, committed `08db78a`. All 9 states built:
G1 file-head verdict chip (set_draft_verdict), G3 toolbar submit popover (rollup verdict + counts),
G4 soft gate (amber), G5 confirm dialog, G6 dismiss-approval (chip menu), G7 copy menu
(noteworthy/all → markdown), G8 nav blocker badge + inspector blocker list + statusbar unresolved,
H2 inspector overview (draft rollup / blockers / round stats). Live via snap.body.files (no reload).
New primitive: `components/ui/popover.tsx` (Base UI Popover). Verified light on dev fixtures
"G6 approved fixture" 019f25d8 + "Approved review" 019f25a5 (has published fix_required → G4/G8/threads).
**Mobile GAP (task #31/#25):** submit popover mispositions on 390px, H2 overview is `lg:flex` only.
Mobile mockup (findings.md) = distinct 52px app bar + bottom-sheet system, no right rail; submit is a
`.sheet`, overview splits into files-sheet header + `.review-banner`. RESUME: user to pick next —
full mobile pass (#25/#31) vs continue desktop breadth (P4 rounds/diff, Ecomplete). Dev `mise run dev`
(:4710/:5173); NOTE CLI (`suikou`) hits a SEPARATE daemon DB — use dev-board fixtures for browser verify.

## Phases

### Phase Board: Projects launcher + settings
- [x] Projects board (sidebar, review list, toolbar) — desktop + mobile
- [x] Global settings modal + per-project settings dialog
- **Status:** complete (committed; mobile design finalized in git history — a later
  redesign attempt was reverted per user, see Decisions)

### Phase P1: Review shell + read-only render
- [x] Review route + ReviewStore mount
- [x] Shell (toolbar / workspace / statusbar)
- [x] Source render (Shiki highlight, tree-sitter outline, file tree/navigator)
- [x] Read-only inline published threads (E4/E13)
- **Status:** complete (committed)

### Phase P2: Composer core
- [x] F1 line composer + add_comment
- [x] F2 range select (shift-click + drag, touch-capable)
- [x] F4 reply composer
- [x] F5 edit pending comment / E3 pending render
- [x] F6 draft persistence + restore
- **Status:** complete (committed)

### Phase P3: Editor render types  ← CURRENT
- [x] D2 preview · markdown — block render + line gutter + Source/Preview toggle +
      view-persist + TOC (committed `da2e2e1`). Block-level comment anchoring in preview
      DONE (task #23, committed `88fb0a3`): gutter click opens composer for the block's
      line range; located threads render under their block. Density/flavor controls not
      requested — skipped (YAGNI).
- [x] D3/D4/D5 html render shell (committed `9cba7cc`): sandboxed iframe (allow-scripts/forms/
      popups/modals, NO same-origin), Comment / Interactive toggle, zoom 10%–200% + click-% reset
      (`3eac2ce`), fullscreen, sandbox tag chip.
- [x] D3 element anchoring + F3 element composer + E15 dots/popover (tasks #27 `21d003e`, #28 `32cf8ed`):
      Comment mode injects a bridge script (sandbox blocks contentDocument). Hover tints the element
      (translucent rounded, not dashed); commented elements carry a pulsing dot; clicking opens ONE
      overlay pinned beside the element in the parent (portal, escapes frame clip, tracks scroll via
      streamed rects) — composer for a fresh element, Thread for an anchored one; opening another
      collapses the previous to its dot. add_comment {type:"element",selector,quote}; persists reload.
      selectorFor excludes suikou-injected nodes so the dots layer doesn't shift :nth-of-type.
      Interactive mode drops the script; its hint moved from a banner to a Tooltip (new Base UI wrapper)
      on an info button beside the toggle.
- [x] D8 image — centered img on checker backdrop + meta caption (name/dims/size/format);
      artifact-scope comments only. Committed `1b336a7`.
- [x] D9 binary — cannot-render notice (Binary icon + explanation + meta pill). Committed `1b336a7`.
- [x] D10 wrap on/off (source) — Source honors `uiStore.codeWrap` (ReviewPage.tsx:891,
      whitespace-pre-wrap vs whitespace-pre); toggle in SettingsModal, persisted (WRAP_KEY).
      Deferred refinement: surface as a toolbar "Display options" popover (mockup has the button).
- [x] D11 empty file — centered empty-state notice (File icon badge + heading + explanation +
      filename pill), sharing a `FileNotice` shell with the binary notice (committed `d2c3dbc`,
      restyled `21d0954`).
- [ ] D11 stacked-all-files mode — deferred to task #26 (overlaps G per-file verdict chip).
- **Status:** D2/D8/D9/D10/D11-empty done. Remaining: D3/D4/D5 html (task #22), D11-stacked (#26).

### Phase P4: Multi-round + git_diff
- [x] A5–A7 latest / history (superseded, read-only) / round compare
- [ ] D6/D7 diff unified / side-by-side
- [ ] J1–J8 git_diff-only states (diff_hunk anchors, refs moved, branch deleted,
      cross-round line diff, diff submit)
- Implementation path for D6/D7/J:
  1. Read the current backend/store contract for git diff reviews and find the canonical diff source.
  2. Prefer feeding raw unified patch text into `@pierre/diffs` (`PatchDiff` / parsed patch path) instead of
     writing our own hunk parser or renderer.
  3. Map Suikou comment anchors to the library's rendered line/hunk structure; keep comment UI on the existing
     shared comment components instead of forking a new diff-thread implementation.
  4. Treat split view as a display-mode concern on top of the same diff payload, not a second diff pipeline.
- **Status:** pending

### Phase G: Verdict / submit
- [x] G1 per-file verdict chip (VerdictChip, set_draft_verdict) · G3 submit panel (SubmitButton +
      Popover, rollup verdict, pending/draft counts) · G4 soft gate (amber, approve+open fix)
- [x] G5 submit confirm (SubmitConfirm dialog) · G6 dismiss approval (VerdictChip menu, dismiss_approval)
      · G7 copy menu (CopyMenu → commentsToMarkdown) · G8 blocker indicator (FileRow badge + Inspector
      blocker list + StatusBar unresolved)
- [x] H2 review overview (Inspector: VerdictSummary rollup / io-blockers list / io-stats round stats)
- [~] G2 file note — deferred (artifact-scope note = existing E2 artifact comment; no dedicated field, YAGNI)
- **Status:** DESKTOP complete (committed `08db78a`). MOBILE deferred to #31/#25 (submit sheet + overview
      access; needs the mobile app-bar/sheet shell — see findings.md "Mobile G spec"). BDR-0018 honored:
      verdict/submit are human UI actions, agent CLI never authors them.

### Phase Ecomplete: Comment lifecycle depth
- [ ] E5/E6 open/resolved · E7 outdated · E8 drifted · E12 reactions
- [~] E14 side/inspector layout · H1–H4 display modes/collapse — implementation substantially complete;
      verified end-to-end; shared `CommentCard` cleanup committed in `451bcd8`; only pixel-level polish remains
- [x] E15 html element dot
- [ ] E16 stranded
- **Status:** pending

### Phase Frest: Remaining composer
- [x] F3 html element composer (done in #27)
- [x] F7 Suggest code block (committed `b997e9e`): line composer "Suggest" button drops a
      ```suggestion fence seeded with the anchored source; markdown.ts fence rule renders it as a
      "Suggested change" add-row card (escaped). E2E-verified in halves (compose in browser; render
      via bun `renderMarkdown`) — browser session wedged before a full visual capture.
- **Status:** complete

## Key Questions
1. State-visualization variants direction: macos / craft / raycast / all three? (待你定)
2. One "state gallery" page, or fold states into each review variant? (待你定)
3. P3 data: does the review store already expose per-artifact render kind
   (markdown / html / image / binary) + raw content, or is that regenerated on
   recompile? (verify before D2)

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Desktop review pane has NO in-pane "New review" card | User confirmed it was deliberately deleted; mockup HTML is stale. Creation via toolbar + project menu |
| Board mobile redesign (chip strip etc.) reverted | Board design already finalized in git history (commits dropped the add-project chip, trimmed header); mockup was out of date |
| Ignore mockup window frames / phone bezels | Real app is full-viewport; frames are storyboard layout only |
| Gates before push = typecheck + build | Frontend has no vitest suite yet (test reports no files) |
| Agent may only reply to existing comments (BDR-0018) | No authoring top-level comments / verdicts; verdict/submit UI is human-only |
| P4 diff renderer = `@pierre/diffs` | Avoid building a custom diff parser/viewer; adapt backend patch data into an existing React diff surface |
| Filesystem watch = `fs_notify` | Reuse the existing Elixir-native watcher instead of inventing another file-change notification path |
| (future #29) Integrate Motion with Base UI | Polish pass — animate Base UI primitives (dialog/menu/tooltip/popover/segmented) + html comment overlay via motion.dev/docs/base-ui |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Re-added the deleted desktop New review card | 1 | Reverted; recorded the decision to memory + this plan |

## Notes
- Authoritative state catalog: `design/pages/review/states.md` (groups A–J, all mockup-✅).
- Detailed mockups: `design/pages/review/states-light.html`, `states-light-mobile.html`.
- Dev: `mise run dev` (Phoenix :4710 + Vite :5173). Chat in 简体中文; repo content English only.
- Update phase status as you progress: pending → in_progress → complete.

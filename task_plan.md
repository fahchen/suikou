# Task Plan: Rebuild the React frontend from the design mockups

## Goal
Reproduce the Suikou review-app frontend (`assets/`) 1:1 from the design mockups,
state by state, against the server-authoritative Musubi runtime — breadth first
(all states present), then depth.

## Current Phase
2026-07-09/10: **Phase Ecomplete (comment lifecycle depth) is DONE.** Shipped E7/E8
re-anchor (Source + markdown preview, `relocate_comment`), E16 stranded band, and E12
reactions — the last grew into a full reaction redesign: disjoint vocabularies (human
approval scale `💯👍👎❌` / agent work status `👀🤔✅`), actor-scoped validation,
single-select per `(target, actor)` with replace-on-conflict, agent-avatar read-only
chips, and the `suikou comment react`/`unreact` agent CLI verbs. Committed (`91a1ae7`,
`2bfce48`, `bcbf2df`, `2b563d9`, `f2ee365`, `47dc475`, `0493d87`, `9008f33`, `b6c2ad7`);
backend 445 tests pass, frontend typecheck/build green, all live-verified on the dev
board ("Reaction demo" fixture `019f4908-1fd6-736e-8b0a-bd1b51d3b334`). **Not pushed.**

Current selected feature task: **none active** — awaiting user pick. Next per backlog:
P4 D6/D7 diff + J1–J8 git_diff (renderer = `@pierre/diffs`), or P3-D11 stacked all-files
mode.

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
1. [x] Ecomplete comment lifecycle depth: open/resolved, outdated, drifted, stranded, reactions — DONE
   (E7/E8 re-anchor, E16 stranded, E12 reaction redesign + agent CLI verb). See Phase Ecomplete below.
2. [x] P-mobile file switching first slice: mobile file head now has previous/next file controls and a
   current-file chip that opens the existing Files sheet. The sheet remains the search/tree fallback.
3. P-mobile #25/#31: finish the mobile app bar and bottom-sheet submit/overview shell, keeping comment actions
   usable without hover.
4. P3-D11 stacked-all-files mode, including comment grouping and interaction with the per-file verdict chip.
5. P4-J diff comment anchoring: map `diff_hunk` comments onto rendered diff lines using the shared comment
   components; introduce `parsePatchFiles` only if rendered-line metadata is actually needed.
6. P4-D6: render `git_diff` reviews with `@pierre/diffs` `PatchDiff` from the existing unified patch payload.
   Keep this as the smallest useful diff viewer before adding custom anchor logic.
7. P4-D7: add unified / side-by-side display switching on the same diff payload. If the library path is not
   straightforward, defer split view instead of building a second renderer.
8. P4-J refs/status states: surface refs moved / branch deleted / unavailable diff states from the existing review
   metadata.
9. P4-J cross-round diff behavior and diff submit edge cases after the renderer and anchors are stable.
10. Small maintenance: add the overscroll CSS rule; use `fs_notify` only when starting file-change-driven work.

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
use `@pierre/diffs`. **Backend contract read + recorded 2026-07-10** in "Diff review backend contract" section below:
`GET /api/review/:id/files/content?path=…` already returns live unified diff text as `text/x-diff` (three-dot merge-base
between pinned `base_ref`/`head_ref`, re-run per request); `file_entries` already ships change_status + added/deleted +
`refs` snapshot; `structure.kind === "diff"` flag already in the client. `diff_hunk` anchor type exists in the schema but
has no frontend renderer path yet. **2026-07-10 slice DONE:** `@pierre/diffs@1.2.12` installed via `bun add`; new
`assets/src/review/components/DiffView.tsx` wraps `PatchDiff` with the raw per-file unified patch; `ReviewPage.tsx`
routes `isDiff && content.kind === "text"` to it before the empty/markdown/source branches. `bun run typecheck` +
`bun run build` green. NOT yet: library theming (default shiki bundle), header/prefix customization, split view,
`diff_hunk` comment anchor overlay, commit-range/worktree axes. Frest done (F7 `b997e9e`).
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
- [~] D6 diff unified — baseline `@pierre/diffs` `PatchDiff` wired for
      `structure.kind === "diff"` files. Skipped: library theming (uses default
      shiki bundle), custom header, `diff_hunk` anchor overlay.
      Follow-ups: D6 polish (theme + header), J anchors.
- [x] D7 diff side-by-side — `uiStore.diffStyle: "unified" | "split"` (persisted
      as `suikou-diff-style`), read by `DiffView` (now an `observer`) and forwarded
      to `PatchDiff` as `options.diffStyle`. Toggle lives in Settings > Review
      defaults ("Diff view", Unified/Split). Same payload, no second pipeline.
      Toolbar-level popover deferred until the user asks (mirrors D10 code-wrap
      approach). `bun run typecheck` + `bun run build` green.
- [~] J1–J8 git_diff-only states
      - [x] J1 refs moved — `RefsMovedBanner` in `ReviewChrome.tsx` shows the drift
            (base/head short SHAs at creation → current) when `structure.refs.refs_moved`
            is true. Renders under Toolbar for diff reviews only. Reuses the existing
            amber-soft banner style.
      - [ ] J2–J8: diff_hunk anchors, branch deleted (null current SHA), unavailable diff,
            cross-round line diff, diff submit edge cases

#### Diff review requirements (user-defined 2026-07-10) — "全部要做"
1. **Scope control** for a diff review:
   - (a) review by a **single commit** OR by **all commits** (commit range).
   - (b) a **toggle** to pick the working-tree source: review **staged** content OR **unstaged** content.
2. **Interaction / navigation**:
   - (a) walk **commit-by-commit** during review (per-commit navigation).
   - (b) OR review **all changes at once** (aggregate diff).
- Resolved decisions (2026-07-10):
  - **Source model = orthogonal, combinable** — `commit range (single/all)` × `working-tree state (staged/unstaged)` are two independent axes that can combine (e.g. all commits + unstaged).
  - **Source binding = live switch in-review** — frontend toggles the source; backend re-reads the live git working tree on demand (HTTP fetch). The review is a *live lens* over git state, not a pinned snapshot.
- Residual boundary edges (proposed defaults, user to confirm):
  - `single commit` × `working-tree state` has no meaning (a historical commit has no current worktree). Default: working-tree axis only applies to `all commits / HEAD-relative`; disable staged/unstaged in single-commit mode.
  - Live diff + comment anchoring: switching source / editing worktree mutates the diff, drifting `diff_hunk` anchors (amplifies E7/E8). Default: reuse existing re-anchor + stranded band; stale comments after a source switch fall into the stranded band.
  - `all commits` base ref still undefined — branch merge-base vs explicit base (resolve after backend-contract read).
- Implementation path for D6/D7/J:
  1. Read the current backend/store contract for git diff reviews and find the canonical diff source.
  2. Prefer feeding raw unified patch text into `@pierre/diffs` (`PatchDiff` / parsed patch path) instead of
     writing our own hunk parser or renderer.
  3. Map Suikou comment anchors to the library's rendered line/hunk structure; keep comment UI on the existing
     shared comment components instead of forking a new diff-thread implementation.
  4. Treat split view as a display-mode concern on top of the same diff payload, not a second diff pipeline.
- **Status:** pending

#### Diff review backend contract (mapped 2026-07-10)
Read-only snapshot of what exists today so the next slice can build on real ground, not the mockup.

- **Data shape** — `Review.source` = `Suikou.Schemas.ReviewSource.GitDiff`
  (`lib/suikou/schemas/review_source/git_diff.ex`): `base_ref`, `head_ref`,
  `base_sha`, `head_sha`. All four are `null: false` at creation; base/head SHAs
  are the creation-time pin. No commit-range field, no worktree-state field.
  BDR-0020 explicitly makes refs **immutable in v1** — "changing branches means
  a new review".
- **Diff semantics** — three-dot merge-base only (`git diff base...head`,
  `Suikou.Git.file_diff/4` at `lib/suikou/git.ex:193`). No staged/unstaged path,
  no per-commit walk, no `HEAD`-relative lens.
- **Live re-read on every request** — content is NOT snapshotted. Every fetch
  reshells out to git (`Suikou.Reviews.fetch_content_by_path/2` at
  `lib/suikou/reviews/reviews.ex:565` → `Git.file_diff/4`); minted artifacts
  store only a SHA-256 hash of the diff text via
  `Suikou.Artifacts.DiffSource.read/1` (`lib/suikou/artifacts/diff_source.ex:65`).
- **File list** — `Reviews.list_files/1` for a `GitDiff` review calls
  `Git.changed_files_with_status/3` + `Git.diff_stats/3` + `Git.blob_ids/3`
  (`reviews.ex:444`). Each entry carries `path`, `change_status`
  (`:added`/`:modified`/`:deleted`/`:renamed`/`:copied`/`:type_changed`), and
  `added`/`deleted` line counts.
- **Frontend payload** — `SuikouWeb.Stores.ReviewStore.load_review_structure`
  reply (`lib/suikou_web/stores/review_store.ex:46`) carries `kind: :diff`,
  `file_entries` (with per-file change_status + added/deleted), and a `refs`
  block (`base_ref`, `head_ref`, pinned + current SHAs, `refs_moved` boolean
  driven by `Reviews.refs_snapshot/1`). Client already reads `structure.kind
  === "diff"` in `ReviewPage.tsx:198` to feed `isDiff` into `FileList`.
- **Content delivery to browser** — HTTP GET
  `/api/review/:review_id/files/content?path=<rel>` (`AssetController.file_content/2`
  at `lib/suikou_web/controllers/asset_controller.ex:79`) → returns the unified
  diff text as `text/x-diff`, whitelisted against `list_files/1`. Consumed by
  `useFileContent` in `assets/src/review/components/EditorSurface.tsx:36`.
  Right now that fetch classifies `text/x-diff` as plain text and renders it
  through the Source/Shiki path with no diff-specific structure.
- **CLI creation** — `suikou review create-diff` verb via
  `SuikouWeb.AgentCLI.Reviews.create_diff/0`
  (`lib/suikou_web/agent_cli/reviews.ex:92`) → `Reviews.create_diff_review/2`
  requires `base_ref` + `head_ref`, defaults `base_ref` to
  `Git.default_branch/1` (origin/HEAD → main → master → current HEAD).
- **Comment anchoring** — `diff_hunk` anchor exists in the generated schema
  (`assets/src/generated/musubi.d.ts` lines 156/228): `{ type: "diff_hunk",
  side: "old" | "new", start_line, end_line }`, plus `quote` for re-anchoring.
  Backend re-locates by quote on re-snapshot (BDR-0020 §5), reusing the E7/E8
  outdated/stranded flow. NO frontend renderer maps hunk lines to anchors yet.
- **Renderer** — `@pierre/diffs` is NOT in `assets/package.json` (checked
  `bun.lock`, 0 hits). Install is Phase P4's first frontend slice.
- **Where diff render will land** — a new `assets/src/review/components/`
  module (parallel to `EditorBodies.tsx` / `HtmlSurface.tsx`), routed inside
  `ReviewPage.tsx`'s file-body switch. Diff-side comments should hang off the
  existing `components/comments/` stack (per D11 requirements).

##### Gap vs the 2026-07-10 user requirements
The user's "commit-range × working-tree-state, live-switchable" model is
**not** in the current backend and is **at odds with BDR-0020's immutable-ref
decision**. Delivering it means one of:

1. **Extend `Suikou.Git`** with commit-range walkers and worktree readers:
   `list_commits/3` (range enumerate), `staged_diff/2`, `unstaged_diff/2`,
   per-commit `commit_diff/2`; plus route them through `Reviews.list_files` /
   `fetch_content_by_path` under new source variants OR a live-lens overlay on
   `GitDiff`. Retire BDR-0020 §3 or write a superseding BDR.
2. **Layer the axes on top of the existing `GitDiff`** — treat the stored
   `(base_ref, head_ref)` as the "all commits" default and add a client-driven
   overlay (`?scope=commit:<sha>` / `?worktree=staged|unstaged`) that
   `AssetController.file_content` and `Reviews.list_files` re-interpret at
   request time. Cheaper diff, still requires new git commands + a live-lens
   contract.

Neither is one iteration. This iteration only records the contract; the next
one picks the smallest useful diff-render slice (probably: install
`@pierre/diffs`, wire it in the review body switch for `structure.kind ===
"diff"`, keep the existing three-dot pinned refs — meets D6, defers the
commit-range/worktree axes for a follow-up backend slice + BDR update).

**Slice progress since:** D6 baseline + D7 unified/split toggle both landed on
the pinned-refs `GitDiff` (already checked off above). **2026-07-10 J1
follow-up:** `refs_moved` was already in the reply payload but had no frontend
surface — added a `RefsMovedBanner` under the toolbar (diff reviews only, uses
existing amber-soft style) so the reviewer can see when the branch tips
drifted from the pinned diff. Still no backend changes; the commit-range /
worktree-state axes remain the next material step and still need a superseding
BDR before implementation.

##### `all commits` base ref — decision
Backend already resolves the default via
`Git.default_branch/1`'s fallback chain (origin/HEAD → main → master →
current HEAD, `lib/suikou/git.ex:65`). Reuse it as the base when the future
"all commits" mode is added; do NOT invent a merge-base picker.

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
- [x] E5/E6 open/resolved (resolve/unresolve committed earlier) · E7 outdated · E8 drifted — E7/E8 re-anchor
      flow: outdated/drifted comments carry a Re-anchor action that arms a gutter/block pick dispatching
      `relocate_comment` (Source `91a1ae7`, markdown preview + stranded `2bfce48`)
- [x] E12 reactions — full redesign: human approval scale `💯👍👎❌` / agent work status `👀🤔✅` (disjoint,
      actor-scoped), single-select per `(target, actor)`, agent-avatar read-only chips, reply reactions, and the
      `suikou comment react`/`unreact` agent CLI verbs. Backend `bcbf2df`/`f2ee365`/`0493d87`/`b6c2ad7`,
      frontend `2b563d9`/`47dc475`/`9008f33`. 445 backend tests; live-verified on the "Reaction demo" fixture
- [~] E14 side/inspector layout · H1–H4 display modes/collapse — implementation substantially complete;
      verified end-to-end; shared `CommentCard` cleanup committed in `451bcd8`; only pixel-level polish remains
- [x] E15 html element dot
- [x] E16 stranded — comments whose anchor line no longer exists surface in a top band with re-anchor (`2bfce48`)
- **Status:** complete (E14 pixel polish is the only optional remainder)

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
| E12 reactions: human + agent both react | User pick (2026-07-09). Reactions carry an `actor` (`:human`/`:agent`) and counts can exceed 1 — deliberately extends the BDR-0018 "agent may only reply" boundary. Human reacts via the UI now; the agent reaction path (CLI verb) is a later deliverable, but the schema/rendering already support `:agent` |
| E12 reactions: disjoint human/agent emoji vocab (2026-07-10) | User pick. Human = approval/opposition scale `💯 strong_agree · 👍 agree · 👎 disagree · ❌ strong_disagree`. Agent = work-status `👀 eyes(working) · 🤔 thinking · ✅ check(done)`. Sets are DISJOINT, so the frontend derives "show bot avatar" from the emoji alone (no snapshot flag). Actor-scoped validation: each actor may only use its own set. Agent reacts via a new agent path (`AgentCLI.Comments.react` + `suikou comment react` verb). Old emoji (tada/heart/pray) dropped |
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

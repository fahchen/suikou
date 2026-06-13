# Planning: two new review capabilities — feasibility & parallelization

Status: **candidate plans, not approved for implementation.** This document
captures two independently-proposed features, judges each for feasibility against
the current codebase, and lays out how to build them in parallel without
colliding.

### Confirmed decisions (user-approved)
- Plan A diff renderer: **two-column structured diff** component (not raw+lexer).
  Anchor model follows from the rendered diff rows.
- Plan A comment quote: **strip the `+`/`-` prefix** before storing the quote.
- Plan A refs: **fixed at creation** (changing branches = new review); no ref
  editing / artifact reconcile in v1.
- Plan B element anchor: **client-only re-anchoring** (carry-forward copies
  selector+quote verbatim; client resolves against the iframe DOM and renders
  "outdated" on a miss); no server-side relocate, no Floki.
- Plan A review storage: **polymorphic embedded `source` field** (see §1A),
  mirroring the existing `polymorphic_embed` anchor pattern — not flat
  type/ref columns.
- Comment location model: **`scope` becomes attachment-level only**
  (`:review | :artifact | :located`); anchor *kind* moves entirely to the
  polymorphic `anchor.__type__` (`line_range | diff_hunk | element`). The old
  `scope` enum conflated two orthogonal axes (where a comment attaches vs. what
  shape its anchor is); this splits them. See §1.0.
- Comment `original_anchor`: **dropped.** Zero readers today; `resolve/2` reads
  only `anchor`. Keeping a second persisted anchor "just in case" is a YAGNI
  violation. `original_round` (the provenance badge's only consumer) **stays**.
  See §1.0.

- **Plan A — Git-diff review type.** A new review whose artifacts are the files
  changed between two branches; each artifact's reviewed content is that file's
  unified diff (`base...head`, three-dot merge-base). Default base = repo default
  branch.
- **Plan B — HTML artifact review.** Render `.html`/`.htm` artifacts as a page in
  a sandboxed iframe and let the reviewer select a rendered region to comment on
  (element-level anchor: CSS selector + text quote). First caller of BDR-0017's
  `element` selector variant.

Both reuse the existing round / comment / carry-forward machinery. Neither
requires a new domain context beyond one shared git adapter (Plan A).

---

## 1. Feasibility

### 1.0 Foundational refactor — comment location model (prerequisite for A *and* B)

Both plans add a new anchor *kind* (A: `diff_hunk`, B: `element`). Today
`Comment.scope` is an `Ecto.Enum` of `[:line, :file, :review]` that conflates two
independent things:

- **attachment level** — does the comment hang off the whole review, a whole
  artifact, or a located span inside an artifact's content?
- **anchor kind** — what shape is the located anchor (a line range? a diff hunk? a
  rendered element)?

Adding kinds by extending `scope` (`:line | :file | :review | :element | …`) keeps
the conflation and forces every new kind to touch the enum, the frontend union,
and every reader. Instead, split the axes **once**, up front:

- `scope :: :review | :artifact | :located` — attachment level only, no payload.
  (`:line` → `:located`, `:file` → `:artifact`.)
- `anchor :: %LineRange{} | %DiffHunk{} | %Element{} | nil` — the polymorphic
  `__type__` carries the kind. A `:located` comment has a non-nil `anchor`;
  `:artifact` / `:review` comments have `anchor = nil`.

This is the cleaner end-state (two orthogonal axes, each modelled by the right
tool: an enum with no payload, a polymorphic embed with payload) and it means A
and B each *append one variant* to `@anchor_types` rather than reshaping `scope`.

**Drop `original_anchor` in the same refactor.** It is persisted today but has
**zero readers** — `Critique.Anchor.resolve/2` quote-locates using `anchor` only
and never touches `original_anchor`; `carry_forward.carry_one/2` copies it
verbatim but nothing downstream reads it. Per CLAUDE.md (no fields without a
caller) it goes. Semantics to preserve in implementation:

- `anchor` — the **live, relocatable** anchor. `resolve/2` re-locates it by quote
  against the current snapshot; relocation *persists*, so `anchor` cannot be a
  virtual field. This is the only anchor field anything reads.
- `original_round` — **kept.** Frozen provenance integer, the sole consumer is the
  frontend "Carried from round N" badge (`CommentCardHeader`).
- `original_anchor` — **removed.** Drop the column, the schema field, the
  `cast_anchor` write, and the `carry_one` copy. Implementers must **not** wire
  `original_anchor` back into `resolve/2` when adding the new kinds.

Frontend half of this refactor (do it once, before A/B append kinds):

- `comments_store` `items.anchor` becomes a **tagged union** —
  `%{type: :line_range, …} | nil` *immediately*, even with only `line_range`
  present, so A appending `:diff_hunk` and B appending `:element` are purely
  additive and never collide on the store shape.
- Rename `scope` readers (`"line"`→`"located"`, `"file"`→`"artifact"`,
  `"review"` unchanged) and narrow every `c.anchor.start_line` reader to
  `anchor?.type === "line_range"`. This is the single largest frontend blast
  radius and belongs to the refactor, not to A or B.

This subsection is realised as track **F1** in §3.

### Plan A — Git-diff review — verdict: **feasible, high confidence**

Leverage point: every content read already flows through the `Suikou.Artifacts`
facade (`read_content/1`, `read_content_or_nil/1`, `content_path/1`); consumers
are `AssetController`, `CommentsStore`, `Critique.Comments` (quote capture /
reanchor), and `Export`. If the facade dispatches content by review type, anchor
resolution, export, and rendering all inherit diff content for free.

Shape of the work:

- New shared adapter `Suikou.Git` (no `Repo`; sits in the open kernel alongside
  `Suikou.Rounds`): `repo?/1`, `default_branch/1`, `ref_exists?/2`,
  `changed_files/3` (three-dot), `file_diff/4` (single-file unified diff). All via
  `System.cmd("git", args, cd: path)` — no shell, args passed directly, `--`
  separates paths (no injection surface).
- `Suikou.Schemas.Review`: replace the flat `selection_paths` column with a
  **polymorphic embedded `source` field** (`polymorphic_embed ~> 5.0`, already a
  dep and used for comment anchors), mirroring `comment.ex`'s
  `polymorphic_embeds_one(:anchor, ...)`. Variants, each its own file under
  `lib/suikou/schemas/review_source/` (one module per file, like
  `schemas/anchor/`):
  - `ReviewSource.FileSelection` — `selection_paths :: {:array, :string}`,
    `__type__ "file_selection"`.
  - `ReviewSource.GitDiff` — `base_ref` / `head_ref`, `__type__ "git_diff"`.
  The embed's `__type__` *is* the discriminator — no separate `type` enum
  column. Dispatch is a struct pattern match (`%GitDiff{}` / `%FileSelection{}`).
  Stored in a `:map` (SQLite JSON) column. **Requires a data migration**: fold
  each existing review's `selection_paths` into
  `source = %{__type__: "file_selection", selection_paths: <old>}`, then drop the
  old column.
- `Suikou.Reviews`: `create_diff_review/2` (base defaults to
  `Suikou.Git.default_branch/1`, validates repo + refs, builds a `GitDiff`
  source); `list_files/1` and `open_file/2` dispatch on the `source` struct
  variant. Existing file-selection paths (`create_review`, `set_selection`,
  `expand`, `list_files`) read `review.source.selection_paths`.
- `Suikou.Artifacts`: internal `DiffSource` (mints round 0 with
  `content_hash = hash(diff_text)`, `resnapshot/1` recomputes when head moves);
  facade content reads dispatch by type; new
  `content_source/1 :: {:ok, {:file, path}} | {:ok, {:inline, bytes, mime}} | {:error, _}`.
- `AssetController.content/2` consumes `content_source/1` (`{:file,_}` →
  `send_file`, keeps image streaming for file reviews; `{:inline,_,_}` →
  `send_resp` with `text/x-diff`).
- `ProjectBoardStore`: render review `type` + refs; add commands
  `list_branches/1` (branches + default) and `create_diff_review/4`.

Risks specific to A:

- **Default branch with no remote.** Fallback chain `origin/HEAD` → `main` →
  `master` → current `HEAD`. Must be explicit; a local-first repo often has no
  `origin`.
- **Frontend cannot route by path extension.** A diff of `foo.ex` has content
  that is a diff, not Elixir. `ReviewStore.state.artifact` must carry a content
  **kind hint** (`:file | :diff`) so the frontend picks the diff renderer
  regardless of `file_path`.
- **Diff renderer + anchor (confirmed two-column).** Serve the unified diff as
  text; the frontend parses it into a **two-column** structured view (old | new).
  A comment anchors to a diff **hunk span**, not a raw text line, so A appends a
  new anchor variant `Anchor.DiffHunk` to `@anchor_types`:
  - fields `side :: Ecto.Enum [:old, :new]`, `start_line`, `end_line`, `quote`
    (quote stored with the `+`/`-` prefix **stripped**, per Confirmed decisions).
  - v1 selects within a single side (`side` is one column); cross-side ranges are
    out of scope.
  - **server-resolved** like `line_range`: `resolve/2` quote-locates it against
    the re-snapshotted diff and reports outdated on a miss (a moved branch can
    reshuffle hunks). `comments_store` tags it `type: :diff_hunk`.
  This is why F1 (the anchor-union store shape) must land before A's frontend —
  A appends `:diff_hunk` to a union that already exists.
- **`resnapshot` semantics.** Committed refs are immutable, so `content_hash` is
  stable until a branch moves; the agent-edits → reviewer-re-snapshots → new
  round lifecycle maps to "agent pushes to head branch, reviewer re-snapshots".

### Plan B — HTML artifact review — verdict: **feasible, medium confidence**

BDR-0017 already defines the polymorphic selector anchor with an `element`
variant "introduced only when an HTML caller exists" — this is that caller, so the
schema direction is pre-blessed. `asset_controller` already serves `.html` with
its own MIME (`text/html`), and `useContent` already fetches non-image content as
text, so the rendered source is available with no backend serving change.

Shape of the work:

- New embedded schema `Suikou.Schemas.Anchor.Element` (mirror of
  `line_range.ex`): `selector` + `quote`, discriminator `__type__ = "element"`.
- `Suikou.Schemas.Comment`: append `element: Element` to `@anchor_types` (B's
  *only* schema change — `scope` is untouched: an element comment is
  `scope: :located` with `anchor.__type__ = "element"`, courtesy of F1). No
  `@scopes` edit, no new enum value.
- `Suikou.Critique.Anchor`: `capture_element/2` (no content read — client
  supplies both); `resolve/2` adds an `%Element{}` clause returning
  `type: "element"` **verbatim, with no server-side outdated computation** (the
  rendered DOM is the only source of truth — unlike `line_range`/`diff_hunk`,
  element is the one client-resolved kind).
- `Suikou.Critique.Comments.put_anchor/2`: `:element` branch from
  `params[:selector]` + `params[:quote]`.
- `CommentsStore`: `add_comment` payload gains `selector` / `quote`; B appends
  `%{type: :element, ...}` to the tagged `items.anchor` union that **F1 already
  established** (so this is additive, not a reshape).
- Frontend: route `.html`/`.htm` to a new `HtmlView` (sandboxed
  `<iframe srcdoc>`, `sandbox="allow-same-origin"`, **no** `allow-scripts`,
  injected `<base>` → asset route); `element-selector.ts` (selectorFor / locate /
  isOutdated against iframe DOM); `HtmlComposer`; `ui-store` ephemeral
  selection fields; narrow all line-only anchor readers to
  `anchor?.type === "line_range"`.

Risks specific to B:

- **Tagged anchor union ripples to the frontend.** Every current reader of
  `c.anchor.start_line` (`Editor` LineRow, raw/render unanchored filters) must
  narrow on `type`. This is the single largest blast radius in B.
- **Client-owned element resolution is net-new TS** (selector derivation, locate,
  outdated). No server fallback — carry-forward copies the anchor verbatim and the
  client renders "outdated" when the selector misses.
- **Sandbox.** `allow-same-origin` without `allow-scripts`: agent `<script>`
  never executes; parent (same origin via `srcdoc`) can read/annotate the iframe
  DOM. Residual: CSS can still trigger external resource loads (`url()`),
  acceptable for a local tool.

---

## 2. Shared touchpoints / conflict matrix

Two **foundational tracks** precede the plans and own the shared model so A and B
stay additive:

- **F1 — comment location model** (§1.0): `Comment.scope` → `:review | :artifact |
  :located`, drop `original_anchor`, frontend scope rename + anchor-union store
  shape + narrow line-only readers. Touches `comment.ex`, `critique/anchor.ex`,
  `critique/carry_forward.ex`, `comments_store.ex`, and the frontend anchor
  readers — i.e. every shared comment surface, **once**.
- **F2 — `Review.source` polymorphic embed** (§1A): replace `selection_paths`
  with embedded `source` (`FileSelection` / `GitDiff` variants) + data migration;
  update `Reviews` reads and `ProjectBoardStore.render_review`.

F1 and F2 are independent of each other (comments vs. reviews) and run in
parallel. After them, A and B each append one variant and never reshape a shared
type.

| Surface | F1/F2 (foundation) | Plan A | Plan B | Conflict? |
| --- | --- | --- | --- | --- |
| `Comment.scope` + drop `original_anchor` | **F1 owns** | — | — | n/a |
| `Review.source` embed + migration | **F2 owns** | — | — | n/a |
| `Suikou.Git` (new) | — | adds | — | no |
| `@anchor_types` in `comment.ex` | F1 establishes union | append `diff_hunk` | append `element` | no (append-only) |
| `Reviews` context | F2 reads `source` | `create_diff_review` dispatch | — | no |
| `Artifacts` facade + `DiffSource` | — | adds | — | no |
| `AssetController.content` | — | rewrites to `content_source` | depends on `{:file,_}` branch staying for html | **ordering** |
| `ProjectBoardStore` | F2 render `source` | adds diff commands + refs | — | no |
| `Critique.Anchor` / `Comments` | F1 drops `original_anchor` from resolve/carry | `diff_hunk` resolve clause | `element` resolve clause (verbatim) | no |
| `CommentsStore` `items.anchor` | **F1 makes it a tagged union** | append `:diff_hunk` tag | append `:element` tag | no (F1 unblocks both) |
| `assets/.../file-type.ts` + route view switch | — | route diff kind → two-column view | route `.html` → HtmlView | **both edit the same switch** |
| Frontend anchor readers | **F1 narrows all to `line_range`** | diff view reads `diff_hunk` | html view reads `element` | F1 removes the conflict |
| `assets/src/generated/musubi.d.ts` | regen (Comment scope) | regen (ReviewStore + board) | regen (CommentsStore) | auto-generated, disjoint regions |
| `spec/decisions/*` BDR | BDR-0022 (location model) | BDR-0020 | BDR-0021 | no (distinct numbers) |
| `spec/domains/.../features` | — | git-diff feature | html feature | no |

With F1/F2 carrying the shared model, A and B backend surfaces are **disjoint**.
The only residual frontend coupling is the single view-routing switch (structure
it as a dispatch so both register independently).

---

## 3. Parallelization

Five phases. The shape changed from "two backend streams + one frontend stream"
to **foundation-first**: the invasive shared-model changes (F1, F2) are pulled out
ahead of both plans so A and B become append-only. Within a phase, tracks run in
parallel; phases are sequenced by the dependency edges below.

### Phase 0 — BDRs (parallel, first)
- BDR-0020 — git-diff review type.
- BDR-0021 — element / HTML anchor.
- BDR-0022 — comment location model (scope-as-level + drop `original_anchor`).

All three are pure docs, no code coupling — write immediately and in parallel.

### Phase 1 — foundational refactors (parallel; touch the existing shared model)
- **F1 — comment location model.** `Comment.scope` → `:review | :artifact |
  :located`; drop `original_anchor` (schema field + column + `cast_anchor` write
  + `carry_one` copy); make `comments_store` `items.anchor` a tagged union
  (`%{type: :line_range,…} | nil`) *now*, with only `line_range`; frontend scope
  rename + narrow every `c.anchor.start_line` reader to
  `anchor?.type === "line_range"`. Keep `original_round`.
- **F2 — `Review.source` embed.** `FileSelection` / `GitDiff` variants under
  `schemas/review_source/`; data migration folding `selection_paths` into
  `source`; `Reviews` + `ProjectBoardStore.render_review` read `review.source`.

F1 (comments domain) and F2 (reviews domain) share no files — fully parallel.

### Phase 2 — plan backends (parallel; each appends one variant)
- **A backend** (needs F2 for `source.git_diff`, F1 for the `diff_hunk` union):
  `Suikou.Git` → `GitDiff` already exists from F2, so `create_diff_review` +
  `Reviews` dispatch → `Artifacts.DiffSource` + facade `content_source` +
  `create_from_diff` → `AssetController` → `ProjectBoardStore` diff commands →
  `Anchor.DiffHunk` variant + `resolve/2` clause + `comments_store` `:diff_hunk`
  tag.
- **B backend** (needs F1): `Anchor.Element` variant → `Critique.Anchor`
  `capture_element` + `resolve` verbatim clause → `Critique.Comments` `:element`
  branch → `comments_store` `:element` tag + `put_anchor` element branch.

### Phase 3 — frontend convergence (after Phase 2)
On F1's already-narrowed, union-aware readers:
1. Shared **view-routing dispatch** (kind hint / extension → component) in
   `file-type.ts` / `review.$artifactId.index.tsx`.
2. A's two-column diff view (reads `diff_hunk`, needs the `ReviewStore` kind hint
   from Phase 2-A).
3. B's `HtmlView` + `element-selector.ts` + `HtmlComposer` + `ui-store`
   selection fields (reads `element`).

### Phase 4 — verification
`mix ci` (ex_dna clones + reach + musubi_ts) + frontend lint/test + manual UI pass
on both surfaces.

### Critical ordering edges
- **F1 before A's `diff_hunk` and B's `element`** — both append to the
  `@anchor_types` and the `comments_store` union that F1 establishes. F1's
  tagged-union store shape prevents A and B colliding on `items.anchor`.
- **F2 before A's `source.git_diff`** — A builds on the embed, not the old column.
  Land the F2 data migration early.
- **A's `content_source` must keep the `{:file, path}` branch** — A rewrites
  `AssetController.content`; B's html serving rides that branch. If A and B land
  near each other, land `content_source` before B touches html serving.
- **Phase 2 before Phase 3** — frontend builds against final backend store shapes.

---

## 4. Cross-cutting risks

- **`ex_dna --max-clones 0` (CI hard gate).** Both plans introduce near-mirror
  code that the zero-clone gate will likely flag:
  - A: `DiffSource` mirrors `FileSource` (`create` / `resnapshot` / `hash` /
    `ensure_present` / round-mint). Extract the shared round-mint + hash helpers
    so neither file clones the other.
  - B: `Anchor.Element` mirrors `Anchor.LineRange` (both `@primary_key false`,
    two string fields, cast+require changeset). The mirror is tiny but a clone is
    still a clone at threshold 0 — verify, and dedupe the changeset shape if
    flagged.
  - A: `Anchor.DiffHunk` mirrors `Anchor.LineRange` too (`start_line`/`end_line`
    + `validate_line_order`). Extract the shared line-order validation (e.g.
    `Anchor.line_order/1`) so DiffHunk, LineRange, and Element don't triplicate
    the changeset shape.
  Note: `mix precommit` does **not** run `ex_dna`/`reach`; only `mix ci` does. Run
  `mix ci` before declaring either plan done.
- **Reach boundary (`reach.check --arch --strict`, CI).** `Suikou.Git` must be
  reachable from both `Suikou.Reviews` and `Suikou.Artifacts`. Place it in the
  open shared kernel (unlisted in `.reach.exs` `boundaries`, like `Suikou.Rounds`
  / `Suikou.Repo`), not as a listed context. Confirm with `reach.check`.
- **`compile.musubi_ts --check` (CI).** Both plans change Musubi store state
  shapes; `assets/src/generated/musubi.d.ts` is generated, never hand-edited.
  Regenerate and commit it as part of each plan.
- **Anchor union is the shared frontend contract.** Whoever lands first sets the
  union shape; the other conforms. Prefer landing B's union early even if B's
  HtmlView ships later, so A's diff view is built against the final reader shape.

---

## 5. Open questions

All v1 design questions are resolved (see "Confirmed decisions" and §1.0 above).
The two-column diff anchor model is settled: a new `diff_hunk` variant
(`side`/`start_line`/`end_line`/`quote`, prefix-stripped, server-resolved by
quote — §1A). Remaining are execution choices only:

1. **Agent ownership of the single frontend switch.** Phase 3's view-routing
   dispatch is the one place A and B both edit. Confirm whether one agent owns the
   whole Phase 3 convergence or two coordinate on the dispatch (structured as a
   registry so either is safe).
2. **F2 migration timing.** The `selection_paths` → embedded `source` migration
   touches existing rows; land it at the very start of F2 so Phase 2-A builds on
   the embed, not the old column.

---

## 6. Recommended sequence

1. **Phase 0** — BDR-0020 (git-diff), BDR-0021 (element), BDR-0022 (location
   model) — parallel, first.
2. **Phase 1** — F1 (comment location model: scope-as-level, drop
   `original_anchor`, tagged anchor union, frontend reader narrowing) and F2
   (`Review.source` embed + data migration) — parallel. **Run `mix ci` after
   Phase 1** — the shared model is now frozen for A and B to append to.
3. **Phase 2** — A backend and B backend — parallel, each appends one anchor
   variant + one store tag. `mix ci` on each.
4. **Phase 3** — frontend convergence on F1's union-aware readers: shared
   view-routing dispatch → A two-column diff view → B HtmlView.
5. **Phase 4** — final `mix ci` + frontend lint/test + manual UI pass on both
   surfaces.

Key shift from the earlier draft: **foundation-first.** Pulling F1/F2 ahead turns
A and B from "two streams that both reshape `scope`/`anchor`" into "two streams
that each append a variant", which is what makes Phase 2 genuinely parallel and
collision-free.

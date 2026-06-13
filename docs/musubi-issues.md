# Musubi Issues Log

Issues found while building Suikou.
Recorded so they can be reported upstream or worked around deliberately.

## ISSUE-1: Root-store commands that mutate only external state never re-render

**Status:** Not a Musubi bug; Suikou usage issue

**Severity:** High in Suikou until fixed locally (silent stale UI)

**Summary**
A root store whose `render/1` derives visible output from an external datastore
(here: Ecto/SQLite via `Suikou.Reads`) does not re-render after a command that
mutates that datastore but returns `{:noreply, socket}` with unchanged socket
assigns. The change persists server-side, but the UI only reflects it after a
full page reload.

This behavior exists, but it is expected under Musubi's contract: root render
state must be driven by socket assigns, streams, and child store state. External
state changes are not dirty signals unless the store also reflects the change in
assigns.

**Root cause**
- `Musubi.Resolver.render_input/3` for the root store (`store_id == []`) reuses
  the cached resolved render when `not Socket.any_changed?(socket)` and there
  are no changed streams (`deps/musubi/lib/musubi/resolver.ex:150-163`).
- `Musubi.Socket.assign/3` records a change in `__changed__` only when the new
  value differs. Re-assigning an identical value intentionally remains a no-op.
- Net effect: after `handle_command` mutates only external state and returns an
  unchanged socket, the render cycle has no root dirty signal, `wire_root` remains
  equal to `previous_wire_root`, the diff is empty, and no `patch` frame is sent.

**Reproduction (Suikou)**
1. Open an artifact (root `SuikouWeb.Stores.ReviewStore`).
2. Add a comment (line- or review-scoped) via any composer.
3. Observed: command persists, but the side rail and the "Submit N" pending
   count do not change.
4. Reload the page; the comment and updated count appear.

Affected commands were the handlers that changed DB state without changing an
assign: `add_comment`, `edit_comment`, `delete_comment`, `resolve_comment`,
`reply`, `relocate_comment`, `submit_review`. Commands that also changed assigns
(`select_round`, `diff_round`, `close_diff`) refreshed normally.

**Conclusion**
Do not report this upstream as a Musubi runtime bug. The root store was deriving
render output from external state without making that state part of Musubi's
tracked model. Under the runtime contract, every visible mutation must update an
assign, stream, or child store state so the render cycle has an explicit dirty
signal.

**Suikou fix**
Replace the ad hoc external-only mutation pattern with one of these local fixes:

1. Prefer loading the changed visible data into assigns and rendering from those
   assigns.
2. If the full data load remains external for now, keep a render-version assign
   such as `:rev` and bump it after every DB-mutating command that affects the
   root render. This is a valid dirty signal, but it should be documented as a
   bridge until the store is modeled more directly from assigns.

The existing `touch/1` helper (`Socket.assign(socket, :rev, System.unique_integer())`)
is therefore a local contract fix, not an upstream workaround.

## ISSUE-2: Child store runs only `init/1` on first mount, never `update/2`

**Status:** Not a Musubi bug; Suikou usage issue

**Severity:** High until fixed locally (silent empty child on first render)

**Summary**
A child store mounted via `Musubi.Child.child(Mod, id: ..., props...)` runs only
`init/1` on its first mount. `update/2` fires on *later* reconciles when a parent
prop value changes, not on the initial mount. A child whose `render/1` reads an
assign that only `update/2` populates therefore renders empty until some later
event (a command, or a parent prop change) triggers a reload.

**Root cause**
- On first mount the reconciler returns a `:mount` action and runs `mount_store`
  → `init_store`, which calls only `init/1`
  (`deps/musubi/lib/musubi/reconciler.ex` `mount_store/1`, `init_store/1`).
- The props passed to `Child.child(...)` are already merged into the child
  socket's assigns by `new_child_socket/5` *before* `init/1` runs, so they are
  available inside `init/1`.
- `update_store/2` (which calls `update/2`) only runs on the `:update` action,
  emitted when `parent_assign_values_changed?/3` is true on a later reconcile.

**Reproduction (Suikou)**
1. Seed a round that already has comments.
2. Mount `ReviewStore`; it mounts `CommentsStore` with `round_id: viewed.id`.
3. Observed: the side rail shows "No comments match the filters" even though the
   round has comments. Dispatching any command (which calls `reload/1`) makes
   them appear.

`CommentsStore.init/1` originally did `Socket.assign(socket, :comments, [])` and
relied on `update/2` to load the round's comments, so a freshly mounted round
rendered an empty thread.

**Conclusion**
Do not report upstream. A child store must produce its full render state from
`init/1` (props are already in assigns there); `update/2` is only for reacting to
later prop changes. Do not treat `update/2` as the single load path.

**Suikou fix**
Load the visible data in `init/1` from the props already merged into assigns:

    def init(socket), do: {:ok, reload(socket)}

`reload/1` reads `socket.assigns[:round_id]` and lists the comments. `update/2`
keeps the same `reload/1` for the round-switch case. Covered by a mount-only
render test in `review_store_test.exs` ("mount renders pre-existing comments
without a command").

## ISSUE-3: Hand-rolled snapshot types defeat the generated codegen

**Status:** Not a Musubi bug; Suikou usage issue (discoverability)

**Severity:** Medium — silent type drift, no runtime effect

**Summary**
`assets/src/review/types.ts` hand-declares the full `ReviewSnapshot` shape plus
`Anchor` / `Reply` / `Comment` / `RoundSummary` / `ArtifactSummary` (lines 9-61),
then casts the hook result onto it: `useMusubiSnapshot(store) as ReviewSnapshot`
(`assets/src/routes/review.$artifactId.tsx:50`). The hand type duplicates the
generated `Musubi.Stores["SuikouWeb.Stores.ReviewStore"]` shape. Add a field to
the Elixir store and the generated type updates, the hand type does not, and the
cast hides the drift — the frontend silently goes stale.

**Root cause**
- `useMusubiSnapshot(store)` already returns a fully-typed `StoreSnapshot<M, R>`
  that recursively resolves nested `StoreField` into child snapshots and
  `StreamField` into arrays — so `snapshot.comments.items: Comment[]` is typed
  out of the box. The hand-written layer is pure redundancy.
- `StoreSnapshot` is already exported from `@musubi/react` /
  `@musubi/client` (it is the return type of the hook). Suikou imports its
  sibling `StoreProxy` the same way (`types.ts:1`) and already threads
  `Musubi.Stores` once for `ReviewStore` (`types.ts:5`).
- The reason for hand-rolling was discoverability, not a missing API: the
  `StoreSnapshot<M, Musubi.Stores>` pattern (and its automatic nested-store
  resolution) was not obvious.

**Suikou fix (no library change needed)**
Delete the six hand interfaces and alias the generated type, symmetric with the
existing `ReviewStore` proxy alias:

    export type ReviewSnapshot = StoreSnapshot<"SuikouWeb.Stores.ReviewStore", Musubi.Stores>

Then drop the `as ReviewSnapshot` cast at `review.$artifactId.tsx:50` (the hook
already returns this type). Adding a field to the Elixir store now propagates to
the frontend types automatically.

**Upstream evaluation (P1 — bound `Musubi.Snapshot<M>` aliases)**
The upstream report proposed emitting registry-bound aliases (via codegen or a
`@musubi/client` `Registry` augmentation interface) so consumers could write
`Snapshot<"X">` instead of `StoreSnapshot<"X", Musubi.Stores>`. Evaluated as
**not necessary**: Suikou uses an alias-once pattern, so `Musubi.Stores` is
threaded exactly once per store and the only thing P1 saves is repeating
`, Musubi.Stores`. The genuine bug (hand-rolled drift) is fixed by the one-line
consumer change above with zero library work. Recommend a docs note upstream on
the alias-once + nested-resolution pattern rather than new API.

## ISSUE-4: Test mock invents a status literal outside the union

**Status:** Suikou test bug

**Severity:** Medium — a green test asserting the wrong code path

**Summary**
`assets/src/review/ProjectBoard.test.tsx:10` mocks the hook as
`useMusubiRoot: () => ({ status: "ok", store: {} })`. `"ok"` is **not** a member
of the real `MusubiRootMount` discriminated union
(`"loading" | "ready" | "error"`), and `store: {}` is untyped. The test passes
only because the component never branches on `"ready"` explicitly and falls
through. The moment production code is written as `status === "ready"`, prod is
correct but this test silently exercises the wrong branch.

**Root cause**
`vi.mock` replaces the whole `../musubi` module with an untyped factory, so the
returned object is never checked against the real union. This is mock drift, not
a library defect — `MusubiRootMount` is already a sound discriminated union.

**Suikou fix**
Use the real discriminant and a typed store in the mock:

    useMusubiRoot: () => ({ status: "ready", store: <typed proxy>, error: null,
      isFetching: false, revalidationError: null })

**Upstream evaluation (P2 / P3)**
- P2 (exported `isReady` / `isLoading` / `isError` guards): **rejected**. Guards
  do not touch the `vi.mock` path (the factory returns a bare object that bypasses
  types), and production branching via `switch (status)` is already clean. Pure
  API-surface bloat.
- P3 (typed `@musubi/react/testing` `mockRoot(module, snapshot)`): **deferred**.
  It would prevent exactly this drift by returning a correctly-typed mount, but
  Suikou has only one or two such mocks and the one-line fix above suffices.
  Worth revisiting upstream only if many components mock the hook.

## ISSUE-5 (non-issues): evaluated and intentionally skipped

- **Read vs dispatch divergence (F3)** — reading `snapshot.comments.items`
  (`review.$artifactId.tsx:76,87`) vs dispatching through the `store.comments`
  child proxy is **by design**: the snapshot is an immutable value tree, the
  proxy is the live command target. Not a defect. Documentation only.
- **IndexedDB cache persister (P4)** — Suikou uses
  `createStorageCachePersister(localStorage)` with `buster: "v1"`
  (`assets/src/musubi.ts:19-21`). No jank observed; review-scale snapshots fit
  localStorage's ~5 MB ceiling comfortably. The persister interface is already
  async (`MaybePromise`), so an IndexedDB adapter stays a future opt-in, not a
  default. Not needed now.

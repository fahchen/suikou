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

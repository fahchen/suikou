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

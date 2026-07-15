# Design: fs_notify file watching + frontend reload prompt

## Context

When a file under review changes on disk, the frontend should notice and prompt
the reader to reload its content.

Investigation found the **backend signal path already exists end to end** — it is
just built on the `:file_system` library. The **frontend never consumes** the
signal.

Current end-to-end path:

- `Suikou.FileWatcher` (`lib/suikou/file_watcher.ex`): one process per review,
  watches the review's selected files/dirs, broadcasts
  `Suikou.Events.fs_changed/3` on change.
- `Suikou.Events` (`lib/suikou/events.ex`): Phoenix.PubSub broadcast of a
  `%Suikou.Events.FsChange{review_id, rel_path, exists?}` struct (defined via
  `TypedStructor`), replacing the bare `{:files_changed, ...}` tuple — a named,
  typed payload the subscribers pattern-match on. Broadcast on a **review-id-scoped
  topic** (e.g. `"review:<id>:files"`) that only the file-forwarding path
  subscribes to, so a disk event never wakes stores that don't care about it.
- `ReviewStore` -> `ReviewBodyStore` -> `FileStore`: forwarded down. If the file
  still exists, `FileStore` **pushes a transient `disk_changed` event** to the
  client (via `Musubi.Event.push_event/3`) — no server state kept. Otherwise the
  file list reshaped (create/delete) and `ReviewBodyStore` bumps
  `structure_version`.

Two gaps:

1. The watcher uses `:file_system`; swap it for the author's own `fs_notify`.
2. No reload-prompt UI on the frontend.

Decisions:

- **Fully replace `:file_system`** with `fs_notify`.
- **Drop the stateful `disk_version` counter** (it was never consumed). Two
  complementary signals replace it:
  - **Live nudge:** a thin, fire-and-forget `disk_changed` Musubi event pushed to
    the open file's client while connected. No version, no ack, no replay.
  - **Reconnect-safe check:** the `FileStore` snapshot carries a `disk_token` —
    the on-disk file's identity (mtime-ns, or a cheap content hash), **computed
    at render time**, not a stored monotonic counter. The client remembers the
    token it loaded content at; on every snapshot (including the mount that
    follows a WS reconnect) it compares, so a change that landed *during the
    disconnect* is still caught. The event just avoids waiting for the next
    render; correctness rests on the token.

## fs_notify API (verified against source)

- `FsNotify.watch(path | [path], opts) :: {:ok, reference()} | {:error, binary()}`.
  Options: `:recursive` (default `true`), `:subscriber` (default calling
  process), `:debounce` (ms, default `0`), `:backend` (`:recommended` | `:poll`).
- Event: `{:fs_notify_event, %FsNotify.Event{kind, detail, paths}}`. One message
  per event; `paths` is a list (a rename is `[from, to]`).
- No `:stop` message; no separate subscribe call (watch == subscribe).
- The OS watch stops automatically when the subscriber process dies or the `ref`
  is GC'd — no terminate cleanup needed.
- Ships precompiled rustler NIFs (macOS/Linux/Windows) — no Rust toolchain.

## Backend changes

### `mix.exs` ✅

`{:file_system, "~> 1.0"}` -> `{:fs_notify, "~> 0.1.0"}`, then `mix deps.get`.

### `lib/suikou/file_watcher.ex` ✅

`changed_path/4`, `subscribe/3`, ref-counting (`handle_call` / `:DOWN`),
`watch_dirs/2`, `ensure_started/3` are **unchanged**. Only the underlying watch
changes:

- `init/2`: replace `FileSystem.start_link/subscribe` with
  `FsNotify.watch(watch_dirs(...), recursive: true, debounce: 50)`; store the
  returned `ref` (or `nil` on `{:error, _}`, staying inert but still
  ref-counting — J5). State field `fs` -> `ref`.
- `handle_info`: replace the two `:file_event` clauses with one
  `{:fs_notify_event, %FsNotify.Event{paths: paths}}` clause that fans each path
  through `changed_path/4` and emits `Events.fs_changed/3`. Drop the `:stop`
  clause.

`debounce: 50` coalesces an editor save's burst. `recursive: true` matches the
old behavior; `watch_dirs/2` already scopes to selected dirs / parent dirs, never
the repo root, avoiding `_build` / `deps` / `node_modules` / `.git` noise.

### `lib/suikou/events.ex` ✅

Define `Suikou.Events.FsChange` with `TypedStructor` (fields `review_id`,
`rel_path`, `exists?`) and broadcast/pattern-match that struct instead of the
`{:files_changed, ...}` tuple. Rename `files_changed/3` -> `fs_changed/3` and
add `subscribe_fs/1`. Update the two consumers that match it —
`ReviewStore.handle_info` and wherever it fans down to `ReviewBodyStore`.

The fs-watch surface carries an `fs_` prefix throughout — struct, function,
topic — to mark it as the filesystem-change channel, distinct from the domain
`review_changed` channel.

```elixir
# review_changed stays on the review topic
defp topic(review_id), do: "review:" <> review_id
# fs changes get a dedicated topic that still carries the review id
defp fs_topic(review_id), do: "review:" <> review_id <> ":fs"

def subscribe_fs(review_id), do: Phoenix.PubSub.subscribe(@pubsub, fs_topic(review_id))

def fs_changed(review_id, rel_path, exists?) do
  Phoenix.PubSub.broadcast(@pubsub, fs_topic(review_id),
    %Suikou.Events.FsChange{review_id: review_id, rel_path: rel_path, exists?: exists?})
end
```

Only the file-forwarding path calls `subscribe_fs/1`, so a disk event never
wakes the review's other `subscribe/1` subscribers. `FileWatcher` calls
`Events.fs_changed/3` (renamed from `files_changed/3`).

### `lib/suikou_web/stores/file_store.ex` ✅

Drop the `disk_version` state field. Add a render-time `disk_token`.

**Deviation from the original sketch:** Musubi has no transient event / `push_event`
channel (nor a `useMusubiEvent` client hook), so the planned live "nudge" event
does not exist. It turned out unnecessary: the `disk_token` in `render/1` already
covers the live case. When `ReviewBodyStore` forwards `%{disk_changed: true}`,
`update/2` returns the socket unchanged, which re-runs `render/1`; the freshly
recomputed token differs from the last, and that diff streams to the client on
the normal snapshot — same channel a reconnect mount uses. One signal, both cases.

```elixir
# render/1 adds the current on-disk identity — recomputed each render, so a
# disk change (or a reconnect mount that follows one) carries a fresh token.
# The absolute path is resolved once at mount so render never hits the DB.
defp disk_token(socket) do
  case socket.assigns[:abs_path] && File.stat(socket.assigns.abs_path, time: :posix) do
    {:ok, %File.Stat{mtime: mtime, size: size}} -> "#{mtime}-#{size}"
    _absent -> nil
  end
end

# A disk change only needs a re-render (fresh disk_token in the snapshot).
def update(%{disk_changed: true}, socket) do
  {:ok, socket}
end
```

`ReviewBodyStore`'s existing `send_update(file_child, %{disk_changed: true})` is
unchanged.

### `test/suikou/file_watcher_test.exs` ✅

No change: the test only exercises `changed_path/4` and the ref-counting
lifecycle — it never injects simulated file events.

## Frontend changes (new reload indicator) ✅

**Single trigger (simplified):** compare the snapshot's `disk_token` to the token
the client loaded content at. Re-evaluated on every snapshot, so it catches both
a live change (the `disk_changed` re-render streams a new token) and one that
landed while the socket was down (the reconnect mount re-delivers the token).
No separate live event — the token diff on the snapshot is the live signal.

On reload, refetch the file's current bytes (no background prefetch) and re-sync
the token. The reader who ignores the indicator pays for no fetch; the previously
loaded content stays on screen meanwhile, so there is no flash. Scoped to the
single-file `Editor` (file-selection reviews), matching the watcher boundary.

### Detect-then-prefetch, reload-then-swap

On going stale, immediately fetch the new bytes in the background into a holding
slot — but keep showing the currently-loaded content. Reload does **not** fetch;
it just swaps the already-fetched holding copy into view. So the click is
instant, and a reader who ignores the indicator never pays for a fetch they
didn't ask for. If the file goes stale again while a holding copy waits, the
prefetch re-runs and replaces it (latest wins).

### `assets/src/review/components/EditorSurface.tsx`

- `useFileContent` gains: a `reloadNonce: number` param (folded into the effect
  deps) and a `prefetch` trigger. On a `disk_changed` event it fetches the new
  URL into a per-URL holding entry in `FILE_CONTENT_CACHE` without replacing the
  visible `content`. On reload (nonce bump) it promotes the holding entry to
  visible — no network call if the holding copy is present, else a normal fetch.
- A `StaleIndicator` element rendered **in the file header** row (next to the
  path/name, alongside the existing view toggles), not a full-width notice.
  Built from existing primitives (`components/ui/button` / badge) — no
  hand-rolled styles (shadcn/Base UI convention).

### Mobile vs desktop

- **Desktop:** an **icon button** (refresh glyph) in the file-header row, quiet
  until stale; a tooltip carries the explanation ("File changed on disk —
  reload"). No inline text — keep the header terse per our button convention.
- **Mobile:** the same refresh **icon only** (no count, no label), tap to reload,
  touch target sized per the mobile sizing convention.
- **Stale cue (both):** recolor the **file path** in the header while stale (no
  header-background tint) — the path itself carries the signal, the icon button
  carries the action.

### `assets/src/review/ReviewPage.tsx`

- Track `loadedToken` keyed by `selectedPath` — the `disk_token` in effect when
  content was last (re)loaded.
- Live nudge:
  `useMusubiEvent(fileProxy, "disk_changed", () => { setStale(true); kickPrefetch() })`.
- Reconnect-safe check: `stale ||= snapshotToken != null && snapshotToken !== loadedToken`.
  This alone covers a change during a disconnect (the mount snapshot re-delivers
  the current token); the event just makes the live case instant.
- Render the header `StaleIndicator` while `stale`. Reload bumps `reloadNonce`
  (promotes the holding copy), sets `loadedToken = snapshotToken`, clears `stale`.
- On file switch (`selectedPath` change) reset `stale` and seed `loadedToken`
  from the new file's snapshot token so nothing leaks across files.

Scope: only file-selection reviews have a watcher (`review_store.ex`
`watch_files/2` skips git-diff), so the prompt appears only there — matching the
existing backend boundary.

### Folder-level changes (new / removed files)

**Design principle: two change kinds, two behaviors.** A *file's content* going
stale needs the reader's judgment — it might be mid-read — so it waits for an
explicit Reload (`disk_token` + `disk_changed` above). A *structural* change — a
new file, a deleted file, a removed folder — carries no such risk, so it is
**applied directly**: the list re-renders on its own, no prompt, no user action.

Structural changes under a **directory** selection ride the existing reshape
path, untouched by this design:

- The watcher already fires `fs_changed(review_id, rel, exists?)` for any path
  under a directory selection (`changed_path/4` matches it).
- In `ReviewBodyStore.update(%{disk_changed: path, exists: exists})`: when the
  path is **unknown** (a create) or **gone** (`exists?: false`), it re-derives the
  file list and bumps `structure_version` — the client refetches the chrome and
  the new/removed file appears/disappears. Only when the path is a **known,
  still-existing** file does it forward to that `FileStore` child (the content
  path above).
- **Live (socket stays connected):** the `structure_version` bump rides the live
  snapshot to the client, which reacts to the bumped value by re-issuing the
  `load_review_structure` command — the file list re-renders in place and the new
  row appears / removed row disappears **automatically, no reload prompt**. Same
  mechanism the review already uses for a file opened/removed through the app; the
  watcher is just another trigger.
- **Perceptibility (deferred):** a brief `FileNavigator` fade on the added/removed
  row would make the auto-applied change more noticeable. Cosmetic only — the
  reshape already works without it — so it is left as a follow-up rather than
  blocking the reload feature.
- Reconnect-safe by construction: the mount re-runs `load_review_structure`, so
  the file list is always rebuilt fresh on reconnect — a create/delete during a
  disconnect shows up without any per-file token.

## Reuse (no new machinery)

- `changed_path/4`, `watch_dirs/2`, ref-counting (the `Events` broadcast, now
  `fs_changed/3`) — all
  kept as is.
- `Musubi.Event.push_event/3` + `useMusubiEvent` — the existing transient-event
  channel; no new realtime machinery.
- `components/ui/button`, the `FileNotice` notice family — reused.

## Follow-up tasks (out of fs_notify scope)

Captured here at the reviewer's request; separate from the file-watching work.

### Submit button icon (`ReviewPanels.tsx`) ✅

The top-right Submit button currently shows `Upload` on the left, "Submit", then a
`ChevronDown`. Change to: drop the `ChevronDown`; replace `Upload` with `Send`
(paper-plane); place the icon to the **right** of the "Submit" label. Apply in
both the `lg` popover trigger and the mobile button.

### Submit default verdict + order (`ReviewPanels.tsx`)

- ✅ Default the chosen verdict from the review's unresolved comments (pending
  included): any `fix_required` → `request_changes`, else any `note`/`needs_answer`
  → `comment`, else `approve`. (Refined past the original blocker-count rule.)
- ✅ Reorder the verdict options to: **request_changes, comment, approve**.

### Comment card resolve/reopen button ✅

Add a **resolve / reopen** button at the **bottom-left** of each comment card, so
the reviewer can toggle a comment's resolved state quickly without a menu. Label
follows the current state (Resolve when open, Reopen when resolved). Reuse
`components/ui/button` (quiet/ghost variant); no hand-rolled styles.

## Review-process note: reaction boundary

During this review the agent tried to post 👀 `eyes` reactions to the human's
comments while under an explicit "wait until I approve" instruction. The auto-mode
classifier **denied** it: a reaction is a visible external-system write on items
the agent did not create, so it crosses a stated boundary even though `react` is
a permitted verb in general.

Takeaway: `comment reply` is the agent's in-scope authoring verb; reactions are
optional and NOT a precondition for replying. When the human has set a
wait-for-approval boundary, do not emit reactions — reply to address the comment
and re-wait. Only react when no such boundary is in force.

## Verification

1. `mix deps.get && mix precommit`.
2. `mise run dev`; open a file in a file-selection review.
3. Edit that file in a terminal -> banner appears.
4. Click Reload -> content refreshes, banner clears.
5. Delete the file -> list reshapes; add a file -> it appears.
6. Switch away and back -> no false stale mark.
7. Before push: `cd assets && bun run build`.

## Future work: reply-level reactions

Today reactions anchor to a whole comment only (`comment react <comment-id>`);
there is no way to react to an individual reply within a comment thread. The
human asked for reply-granular reactions so an agent's work-status signal
(👀/🤔/✅) can attach to the specific reply it concerns, not just the comment.

Sketch:
- Backend: reactions currently key on `comment_id` + `actor` + `emoji`. Extend
  the reaction owner to also cover a reply — either a nullable `reply_id` on the
  reaction row (a reaction belongs to a comment when `reply_id` is null, to a
  reply otherwise) or a polymorphic reactable. Keep the one-reaction-per-actor
  invariant scoped per target.
- CLI: add `reply react <reply-id> --emoji <...>` and `reply unreact <reply-id>`
  mirroring the existing comment verbs; same disjoint human/agent vocabularies.
- Frontend: render the reaction chip on the reply row, not only the comment
  header.

Out of scope for the fs_notify feature; recorded here so it is not lost.

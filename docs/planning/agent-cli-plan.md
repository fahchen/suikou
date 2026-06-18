# Suikou agent CLI — command/subcommand tree with flags

## Context

Today Suikou is driven entirely through the browser (Musubi stores). An AI agent
that produced the code under review can't participate: it can't ask for a review,
see the human's critique, or answer back. We want a **git-style CLI** so an agent
can run the full loop:

1. create a project + review pointing at its work,
2. `suikou review poll <review-id>` — **block until the human submits**, then print
   the latest published critique,
3. fix the code,
4. `suikou comment reply <comment-id> --body "…"` — answer threads (BDR-0007 /
   BDR-0018: agent **only replies**, never authors top-level comments, never submits),
5. loop back to `poll` for the next round.

Plus project/review management. We also ship a **skill** so a Claude-Code-style
agent knows how to drive it.

### Transport decision (confirmed)

The `suikou` binary is the **bun launcher** (`packaging/launcher.ts`) that spawns
the OTP release `bin/suikou start`. The app is **server-authoritative**: live state
lives in Musubi GenServer stores inside the *running* BEAM node; the open browser
refreshes only via `Phoenix.PubSub`.

Chosen transport: **release `rpc`** (Erlang distributed call). bun subcommands shell
into `bin/suikou rpc "…"`, which evaluates **inside the running node** — same `Repo`,
same `PubSub`, so the human's open browser updates live. Consequences:

- No HTTP API/router/controllers/port-discovery/auth needed.
- The agent surface is **never on the network** — only a local process with the
  release cookie can call it. That is why "no auth" is safe.
- `rpc` only works against a **running** server; "not running" must error cleanly.

> Risk to verify first: mix releases default `RELEASE_DISTRIBUTION=sname` + a
> generated cookie, so `bin/suikou rpc` should work out of the box on the same host.
> If a build has distribution off, enable it in the release env. Confirm before the
> rest (see Verification).

## CLI shape: `suikou <group> <verb> [<id>] [flags]`

Three command groups (nouns) × verbs. Ids that name the *subject* are positional;
flags carry the rest. bun owns parsing + flag validation + `--help`; each verb maps
to exactly one Elixir function.

```
suikou project list
suikou project create   --name <name> --path <path>

suikou review  list      --project <project-id>
suikou review  create    --project <id> --name <name> --files <a,b,c>
suikou review  create-diff --project <id> --name <name> --base <ref> --head <ref>
suikou review  show      <review-id>
suikou review  files     <review-id>
suikou review  rename    <review-id> --name <name>
suikou review  set-files <review-id> --files <a,b,c>
suikou review  delete    <review-id>
suikou review  export    <review-id> [--rounds <a-b>] [--all]
suikou review  poll      <review-id> [--rounds <a-b>] [--all] [--timeout <secs>]

suikou comment reply     <comment-id> (--body <text> | --body-file <path> | stdin)

suikou help [<group> [<verb>]]      # also: --help / -h on any node
```

(`suikou poll <id>` kept as a thin alias for `review poll`, since that was the
original ask.) Any unrecognized first token → fall through to **boot the server**
(today's behavior, unchanged).

**`export` / `poll` rounds scope.** Default is the **latest round's published
critique** — aligned with today's `Suikou.Export.export/1` (`status == :published`
comments, resolved/outdated flags retained; no critique-type filtering). `--rounds
<a-b>` widens it to a round range (single round `--rounds 3` allowed); `--all`
returns every round. These flags scope **content only** — `poll`'s wake/timeout is
driven internally by `submission_version` (below), not by a user cursor.

### Backend mapping (each verb → one function, no giant dispatch)

| CLI | Elixir fn | backend (reuse) | result |
|---|---|---|---|
| `project list` | `AgentCLI.Projects.list/0` | `Projects.list_projects/0` | `[{id,name,path}]` |
| `project create` | `AgentCLI.Projects.create/1` | `Projects.register_project/1` | `{project_id}` \| `{error}` |
| `review list` | `AgentCLI.Reviews.list/1` | `Projects.get_project/1` + `Reviews.list_for_project/1` | `[{id,name,kind,…}]` |
| `review create` | `AgentCLI.Reviews.create/1` | `Reviews.create_review/2` (`files`→`selections`) | `{review_id}` \| `{error}` |
| `review create-diff` | `AgentCLI.Reviews.create_diff/1` | `Reviews.create_diff_review/2` | `{review_id}` \| `{error}` |
| `review show` | `AgentCLI.Reviews.show/1` | `Reviews.get_review/1` + `Reviews.list_files/1` | review meta + files |
| `review files` | `AgentCLI.Reviews.files/1` | `Reviews.list_files/1` | file list |
| `review rename` | `AgentCLI.Reviews.rename/1` | `Reviews.rename_review/2` | `{error}` |
| `review set-files` | `AgentCLI.Reviews.set_files/1` | `Reviews.set_selection/2` | `{error}` |
| `review delete` | `AgentCLI.Reviews.delete/1` | `Reviews.delete_review/1` | `{error}` |
| `review export` | `AgentCLI.Reviews.export/1` | **new** `Export.export_review/2` | critique snapshot for the rounds scope (default latest; one-shot) |
| `review poll` | `AgentCLI.Reviews.poll/1` | long-poll (below) | scoped snapshot incl. `submission_version`, or `{status:"timeout",version}` |
| `comment reply` | `AgentCLI.Comments.reply/1` | `Critique.reply_as_agent/2` + broadcast | `{reply_id}` \| `{error}` |

Comment ids for `reply` come from `export`/`poll` output (each comment view carries
`id`). Agent gets no `open_file`/`add_comment`/`submit` — human-only per BDR-0018.

### Argument passing (rpc-safe) — JSON over stdin, no encoding

**No base64.** The rpc expression stays **static** per verb and carries **no user
content** — all parameters travel as a JSON payload piped over **stdin**:

```
echo '<json>' | bin/suikou rpc 'SuikouWeb.AgentCLI.Reviews.poll()'
```

Why it works: an rpc'd function executes on the running node, but its group leader is
forwarded to the caller's (`bin/suikou rpc`) stdio — the pipe bun controls. So the
remote `IO.read(:stdio, :eof)` reads exactly what bun wrote, and `IO.puts` returns to
bun's stdout. Because nothing user-supplied is ever interpolated into the expression,
quotes / newlines / backticks in a markdown body are **impossible to break** — no
escaping, no injection. Uniform for every verb, including zero-arg ones (pipe `{}`).

`comment reply` body sources (avoid shell-quoting a multi-line markdown arg):
`--body <text>`, **`--body-file <path>`**, or **stdin** when neither is given. bun
folds the chosen body into the JSON payload it pipes (so for the stdin case, bun reads
its own stdin for the body, then re-emits the full payload to the child).

> Key risk to verify (see Verification): that the release `rpc` command forwards
> stdin to the evaluated code. If it does not, fall back to a **temp file**: bun
> writes the JSON to `mkdtemp`, passes only the **bun-generated path** in the
> expression (`…poll("/tmp/…/payload.json")` — path chars are controlled, still no
> escaping), Elixir `File.read!` + decodes, bun deletes after. Same safety property.

## Live reflection into the web (the reactivity contract)

Musubi stores are server-authoritative and render from the DB, but a mounted store
only pushes a patch when an **assign goes dirty** — it does not watch the DB
(`docs/musubi-issues.md` ISSUE-1). Each browser connection is its **own** store
process, so the only cross-process refresh channel is **PubSub** (`touch/1` refreshes
only the connection that issued the command). A CLI write therefore has to **broadcast**
after committing, mirroring exactly what the in-browser command path already does.

| CLI write | mounted store(s) affected | how it reflects live |
|---|---|---|
| `comment reply` | root `ReviewStore` fan-out + `CommentsStore` child thread | CLI broadcasts on the review topic (same as `CommentsStore.broadcast_changed/1`). Root is subscribed ✓. The child is not a process and cannot subscribe — the root's `handle_info` fans out to it via `Musubi.send_update/2` (below). |
| `review submit` (human) | submitting tab + sibling review tabs | broadcast on submit (backend change #3) |
| `create-project` / `create-review` / `create-diff` | `ProjectBoardStore` (board) | **no PubSub today** — add a board topic + subscription (below) |
| `rename` / `set-files` / `delete` | board card; an open `ReviewStore` of that review | board topic refreshes the card; an open ReviewStore refreshes on next mount/nav (optionally broadcast the review topic to refresh sooner) |

Concretely this adds two reactivity hooks beyond reusing `CommentBroadcast`:

- **Root `send_update` fan-out to the comments child** (musubi 0.9.0, BDR-0030) — the
  root `ReviewStore` already subscribes to `CommentBroadcast` and handles
  `:comments_changed` by bumping `:comment_rev` (refreshes the all-files fan-out). A
  child store is **not a process** and cannot subscribe, so additionally call
  `Musubi.send_update(["comments"], %{reload_token: System.unique_integer()})` in that
  `handle_info`. The child's `store_id` is `["comments"]` (from
  `Child.child(CommentsStore, id: "comments", …)`) and `CommentsStore.update/2` is
  already `assign |> reload`, so the pushed `reload_token` (a key the parent never
  supplies → clean `subtree_dirty?` path) reloads the open single-file thread from the
  DB. This also closes a latent gap today: a sibling browser tab's open thread does not
  refresh on another connection's mutation (only its fan-out does).
- **Board topic + `ProjectBoardStore` subscription** — a small review-list broadcast
  (e.g. a `BoardBroadcast` module, topic `"project_board"`, message `:board_changed`).
  `ProjectBoardStore.mount/2` subscribes; as a **root** store with no children it
  recomputes `review_files` (existing `refresh_review_files/1`) and dirties an assign in
  `handle_info(:board_changed, …)` → re-render (no `send_update`). The CLI
  `Projects.create`, `Reviews.create`/`create_diff`/`rename`/`set_files`/`delete`
  broadcast it after the write so an agent-created review pops onto an open human board
  live.

## Backend changes (Elixir)

**Prerequisite:** bump the dep to **`{:musubi, "~> 0.9.0"}`** (`mix.exs` + `mix.lock`,
`mix deps.get`) for `Musubi.send_update/2,3` (BDR-0030; on hex 2026-06-17).

New public functions need `@doc` + an `## Examples` block (non-`iex>`, they hit
`Repo`), concrete specs, `params` naming. Use **Jason** (project dep; Elixir `~> 1.15`
so stdlib `JSON` isn't guaranteed — project-specific exception to the global rule).

1. **`Suikou.Export.export_review/2`** — `lib/suikou/export/export.ex`. Aggregate a
   per-artifact export across a review's *minted* artifacts for a **rounds scope**
   (`:latest` default | `{from, to}` | `:all`). Returns
   `%{review_id, name, project_id, submission_version, artifacts: [...]}` or
   `{:error, :review_not_found}`. Today's `export/1` is hardcoded to `Rounds.latest` +
   that round's `status == :published` comments; generalize the per-artifact builder to
   take a rounds scope (default `:latest` preserves current behavior, range/`:all` walk
   the selected rounds), then walk `Reads.list_review_artifacts/1` and map it.
   "Noteworthy" = the existing `:published` filter (resolved/outdated flags retained) —
   **no** new critique-type filtering.

2. **`Suikou.Submissions.review_submission_count/1`** — `lib/suikou/submissions/submissions.ex`.
   `Submission` ⋈ `Round` ⋈ `Artifact` by `review_id`, `Repo.aggregate(:count)`.
   Monotonic per submit → the poll "version". Returns `non_neg_integer()`.

3. **Wake broadcast on submit** — `lib/suikou_web/stores/review_store.ex`,
   `handle_command(:submit_review, …)` success branch (lines 282–297). After a
   successful `Submissions.submit/2`, call `CommentBroadcast.broadcast(review_id)`
   (review id via `Reads.get_artifact(artifact_id).review_id`). Wakes the poll **and**
   refreshes sibling browser tabs. Reuse the existing `CommentBroadcast` review topic.

4. **AgentCLI modules** (rpc delivery boundary, parallel to controllers/stores; one
   module per file, public-then-private). Split by noun to mirror the command tree:
   - **`SuikouWeb.AgentCLI`** — `lib/suikou_web/agent_cli.ex`. Shared runtime only:
     `read_payload()` → `IO.read(:stdio, :eof) |> Jason.decode!()`; `emit(map)` →
     `IO.puts(Jason.encode!(map))`; error formatting (atom → string; changeset →
     `"field message, …"`, mirroring the stores' `review_error/1`). No command logic.
   - **`SuikouWeb.AgentCLI.Projects`** — `list/0`, `create/1`.
   - **`SuikouWeb.AgentCLI.Reviews`** — `list/1`, `create/1`, `create_diff/1`, `show/1`,
     `files/1`, `rename/1`, `set_files/1`, `delete/1`, `export/1`, `poll/1`.
   - **`SuikouWeb.AgentCLI.Comments`** — `reply/1`. After `Critique.reply_as_agent/2`,
     resolve review id (`get_comment` → round → artifact) and `CommentBroadcast.broadcast/1`
     so the human's open thread shows the reply live.
   - **`SuikouWeb.AgentCLI.Projects`/`Reviews` writes** — after the context call,
     `BoardBroadcast.broadcast/0` (item 6) so an open board reflects the change.
   - **`poll/1`** runs *on the running node* (rpc), so it `CommentBroadcast.subscribe`s
     and `receive`s `:comments_changed`. Capture
     `version = Submissions.review_submission_count(review_id)` at call start, then block
     in `receive … after` **capped ~25 s per call**, recomputing version on each
     `:comments_changed`; return the `export_review` snapshot (for the requested rounds
     scope) when it increases, else `{status:"timeout", version}`. bun re-issues until the
     version changes or `--timeout` elapses (sidesteps rpc-level timeouts; instant wake
     in-window). The wake cursor is this internal `submission_version` — **no** user-facing
     version flag; `--rounds`/`--all` scope the returned content only.

5. **Root `send_update` to the comments child** —
   `lib/suikou_web/stores/review_store.ex`, `handle_info(:comments_changed, …)` (~line
   190). Alongside the existing `:comment_rev` bump, add
   `Musubi.send_update(["comments"], %{reload_token: System.unique_integer()})` so an
   open single-file thread refreshes from an external (CLI) reply. **No change** to
   `comments_store.ex` — its `update/2` already `assign |> reload`s. (Replaces the old
   "child subscription" idea: child stores are not processes and cannot subscribe; the
   root is the only PubSub delivery path and `send_update` is the intra-page last hop.)

6. **`SuikouWeb.Stores.BoardBroadcast`** — new `lib/suikou_web/stores/board_broadcast.ex`,
   mirroring `CommentBroadcast`: `subscribe/0` + `broadcast/0` on topic `"project_board"`,
   message `:board_changed`. `ProjectBoardStore.mount/2` subscribes; as a **root** store
   with no children it recomputes `review_files` (existing `refresh_review_files/1`) +
   dirties an assign in `handle_info(:board_changed, …)` — no `send_update`. CLI
   project/review writes broadcast it.

No router/controller/view/auth changes.

## Launcher changes (bun) — `packaging/launcher.ts`

- Refactor today's top-level server boot into `runServer()`.
- A **command registry**: `{ [group]: { [verb]: spec } }` where `spec` declares the
  `util.parseArgs` `options` (per flag: `type`, `multiple`, `short`, required),
  whether a positional id is expected, and the target Elixir function name. Parsing
  uses **`parseArgs` from `node:util`** (Bun-native: returns `{ values, positionals }`)
  — no hand-rolled parser. Required-flag validation + `--help`/`-h` layered on top.
- Entry: read `group = argv[2]`, `verb = argv[3]`; on a known pair →
  `parseArgs({ args: Bun.argv.slice(4), options: spec.options, allowPositionals: true })`,
  take the id from `positionals[0]`, resolve `--body`/`--body-file`/stdin for replies,
  then `runCommand`: `ensureExtracted()` → build the JSON payload object →
  `spawn([bin, "rpc", spec.expr], { stdin: <json string>, stdout: "inherit", stderr: "inherit" })`
  where `spec.expr` is the **static** call (e.g. `SuikouWeb.AgentCLI.Reviews.poll()`).
  bun feeds the JSON on the child's stdin and closes it (EOF) → exit with child status.
- The `poll` alias maps to the `review poll` spec.
- Detect "server not running" (non-zero rpc exit / node-down stderr) → print
  `Suikou is not running — start it first with \`suikou\`.` and exit non-zero.
- Unknown/empty first token → `runServer()` (unchanged).
- `suikou help` / per-node `--help` print the tree from the same registry.

## Skill — `.claude/skills/suikou/SKILL.md` (committed, English)

Documents: prerequisite (app running), the full command tree + flags, JSON output
shapes, and the **review loop** (`review create` → `review poll` → fix →
`comment reply` → poll again). The default snapshot is the **latest round's published
critique**; `--rounds <a-b>` widens it to a round range and `--all` returns every
round. poll's wake is server-managed (`submission_version`), so no round is missed
between calls. Note the agent only replies — never submits or authors comments.

## Verification

1. **rpc smoke test first** (de-risks everything): build (`MIX_ENV=prod mix release`
   or `mix suikou.package`), start it, then from another shell:
   - reachability: `bin/suikou rpc 'IO.puts(123)'` must print `123`. If unreachable,
     enable distribution in the release env before continuing.
   - **stdin forwarding** (the arg-passing mechanism):
     `echo '{"x":1}' | bin/suikou rpc 'IO.puts(IO.read(:stdio, :eof))'` must echo
     `{"x":1}`. If stdin is not forwarded, switch the launcher to the temp-file
     fallback described in *Argument passing*.
2. **Unit tests** (ExUnit + ExMachina): `Export.export_review/2` (default latest, a
   round range, `:all`), `Submissions.review_submission_count/1`, and each `AgentCLI.*`
   fn (decode args → assert emitted JSON). Wake path: subscribe a test process, submit
   via the store command, assert `:comments_changed` received and the count incremented;
   child fan-out: assert `ReviewStore.handle_info(:comments_changed)` emits
   `{:musubi_send_update, ["comments"], _}` (via `Musubi.Testing`).
3. **End-to-end + live reflection**: `dist/suikou` (server) with the board open in a
   browser. `dist/suikou review create …` → the new review **pops onto the open board**
   (board broadcast). `dist/suikou review poll …`; submit a verdict + comment in the
   browser → `poll` unblocks and prints critique. `dist/suikou comment reply …` → the
   reply **appears live in the open thread** (root `send_update`) and in the all-files
   fan-out. Flag parsing exercised (missing required flag → friendly error; `--help`).
4. `mix precommit` clean (format, credo --strict, dialyzer, ex_dna, reach.check, tests).

## Suggested commit breakdown (keep commits small)

1. `Export.export_review/2` + `Submissions.review_submission_count/1` (+ tests).
2. Reactivity hooks: wake broadcast on submit in `ReviewStore`, root `send_update` to
   the comments child, `BoardBroadcast` + `ProjectBoardStore` subscription (+ tests).
3. `SuikouWeb.AgentCLI` shared runtime + `Projects` / `Reviews` / `Comments` command
   modules, each broadcasting the right topic after its write (+ tests).
4. `packaging/launcher.ts` command registry + `util.parseArgs` routing + stdin payload.
5. `.claude/skills/suikou/SKILL.md`.

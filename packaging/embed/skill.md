---
name: suikou
description: Use when the human names Suikou — "suikou review", "create a suikou review", "open a review on Suikou", "submit this to Suikou" — or when a Suikou review is already in play: the `suikou` CLI, a review id, a /reviews/ URL, a question about what the reviewer said, or a request to address, reply to, or wait for review comments. Not for ordinary code review that isn't going through Suikou. Runs the agent side end to end: create a review over files or a git diff, notify the human, block until they publish a critique, read their comments, fix the code, and reply per comment until approved.
---

# Suikou agent CLI

`suikou` is a single binary. Every `<group> <verb>` shells into the running server and prints exactly **one line of JSON** to stdout. Parse that line. On failure it writes a message to stderr and exits non-zero.

## Prerequisite: the server must be running

If any command prints

```
Suikou is not running — start it first with `suikou`.
```

the human starts it — `suikou` (foreground, opens the browser) or `suikou start` (background daemon). **Do not start it unprompted**; ask the user to.

## Command tree

```
suikou project list
suikou project create      --name <name> --path <path>
suikou review  list        --project <project-id>
suikou review  create      --project <id> --name <name> (file1 file2 … | --diff <base>..<head>)
suikou review  show        <review-id>
suikou review  list-files  <review-id>
suikou review  url         <review-id>
suikou review  open        <review-id>
suikou review  rename      <review-id> --name <name>
suikou review  set-files   <review-id> file1 file2 …
suikou review  add-files   <review-id> file1 file2 …
suikou review  remove-files <review-id> file1 file2 …
suikou review  delete      <review-id>
suikou review  export      <review-id> [--rounds <a-b>] [--all]
suikou review  wait        <review-id> [--until-round <n>] [--rounds <a-b>] [--all] [--timeout <secs>]
suikou review  notify      <review-id> [--message <text>]
suikou comment add         <review-id> --path <file> [--type note|fix_required|needs_answer] [--line <n>-<m> | --hunk old|new:<n>-<m> | --review-wide] (--body <text> | --body-file <path> | stdin)
suikou comment reply       <comment-id> (--body <text> | --body-file <path> | stdin)
suikou comment resolve     <comment-id>
suikou comment reopen      <comment-id>
suikou comment react       <comment-id> <emoji>
suikou comment unreact     <comment-id>
suikou reply   react       <reply-id> <emoji>
suikou reply   unreact     <reply-id>
suikou wait  <review-id> [...]          # alias for `review wait`
suikou open                             # open the board root in the browser
suikou version                          # print the build identifier
```

- **Files are positional args**, space-separated: `create … lib/a.ex lib/b.ex README.md`. One token = one path (no comma-splitting — a comma is a legal filename char). Paths are relative to the project's root path. Prefix with `--` if a path starts with `-`.
- `create` builds a **file-selection** review from positional files, or a **git-diff** review from `--diff <base>..<head>` — give exactly one (both/neither errors).
- `set-files` / `add-files` / `remove-files` each need **at least one** path — a bare `set-files <id>` errors rather than silently clearing. To drop a whole review use `delete`.
- `react` takes the emoji as a positional: `comment react <id> 👀`. The agent may use **any** emoji glyph — 👀 / 🤔 / ✅ are just the suggested work-status convention.
- `set-files` **replaces** the whole selection; `add-files` / `remove-files` are **incremental** — pass only the paths to add or drop, not the full list.
- `comment add` / `comment reply` body sources, in priority order: `--body`, then `--body-file <path>`, then stdin read to EOF. **Prefer `--body-file` or stdin for multi-line markdown** — avoids shell quoting hell.
- **Every write verb also takes `--as <name> [--icon <emoji>]`** — see *Who you are* below. `suikou help <group>` prints it per verb.
- `comment add` targets a **review id plus `--path`** (a path from `review list-files`), not an artifact id: a file's artifact does not exist until someone opens it, and a reviewing agent usually arrives first. The path must be one the review covers. Its scope follows what you point at: `--line 12-14` (a file's lines) or `--hunk new:12-14` (a diff hunk) makes it line-scoped, `--review-wide` lifts it off the file, and the default sits on the file as a whole.

## Who you are (`--as` / `--icon`)

Several agents review one review at a time, so **every comment, reply, and reaction records who wrote it**. `--as` is **required** on every write — a nameless one is refused before anything is stored.

```
suikou comment add <review-id> --path lib/a.ex --as Codex --icon 🤖 --body-file finding.md
```

**Pick your own name.** It is a handle, not your model — `Codex`, `perf-reviewer`, `second-pass` are all fine. Pick one and keep it for the whole review, so a thread reads as a conversation rather than a pile of anonymous notes. `--icon` is one optional emoji that renders beside it.

**`human` is reserved.** It is the reviewer's name (any capitalisation), and claiming it is rejected — nothing you write can be mistaken for theirs. The reviewer's four reaction keys (💯/👍/👎/❌) are reserved the same way; react with a glyph instead.

`wait` takes no `--as`: it blocks on the human publishing a round, not on any one comment.

## Rounds scope

Applies only to `export` and `wait`; controls *which rounds' published comments* the snapshot carries (content scope only — never changes state):

- no flag → `:latest`: the latest round's published critique (matches the human export).
- `--rounds 3` → that single round.
- `--rounds 1-3` → inclusive range.
- `--all` → every round.

`--all` and `--rounds` are mutually exclusive.

**`--rounds` is content scope, NOT a wait target.** `wait --rounds 1` does not wait for round 1 — it waits for the *next* submission (blocking forever if none comes) and merely scopes the eventual snapshot to round 1. To wait for a specific round use `--until-round <n>` (below).

## JSON output shapes

`project list`
```json
{"projects":[{"id":"0192…","name":"Docs","path":"/tmp/docs"}]}
```

`project create`
```json
{"project_id":"0192…","error":null}
```

`review list` (`error` is `"project_not_found"` when the project is unknown)
```json
{"reviews":[{"id":"0192…","name":"Spec","kind":"file_selection","selections":["docs"]}],"error":null}
```
`kind` is `"file_selection"` (then `selections` lists its paths) or `"git_diff"` (then `selections` is `[]`).

`review create` (file-selection or git-diff)
```json
{"review_id":"0192…","error":null}
```

`review show`
```json
{"id":"0192…","name":"Spec","kind":"file_selection","selections":["docs"],"files":[{"path":"doc.md","artifact_id":null}],"error":null}
```

`review list-files`
```json
{"files":[{"path":"doc.md","artifact_id":null}],"error":null}
```

`review url` / `review open` (`open` also spawns the browser; `suikou open` with no id emits the board root URL the same way). The host/scheme follow the endpoint's configured URL.
```json
{"url":"https://suikou.example/reviews/0192…","error":null}
```

`review rename` / `set-files` / `add-files` / `remove-files` / `delete` (`error` is `null` on success, else an error atom string like `"review_not_found"` or `"not_a_file_selection"`)
```json
{"error":null}
```

`review export` and a successful `wait` wake both emit the **critique snapshot**:
```json
{
  "review_id":"0192…",
  "name":"Spec",
  "project_id":"0192…",
  "submission_version":2,
  "artifacts":[
    {
      "artifact_id":"0192…",
      "title":"doc.md",
      "round":2,
      "content":"<full current file text>",
      "verdict":"request_changes",
      "approved":false,
      "approved_round":null,
      "comments":[
        {
          "id":"0192…",
          "scope":"located",
          "critique_type":"fix_required",
          "author":{"kind":"human","name":"human","icon":null},
          "body":"this needs a guard clause",
          "anchor":{"start_line":12,"end_line":14,"quote":"def foo(x)"},
          "original_round":2,
          "resolved_round":null,
          "resolved_by":null,
          "resolved":false,
          "outdated":false,
          "line_anchor":true,
          "reactions":[{"emoji":"👀","actor":{"kind":"agent","name":"Codex","icon":"🤖"}}],
          "replies":[{"id":"0192…","author":{"kind":"agent","name":"Codex","icon":"🤖"},"body":"fixed in round 3"}]
        }
      ]
    }
  ]
}
```
Field notes:
- `verdict`: `"approve"` | `"request_changes"` | `"comment"` | `null` (latest submitted round's verdict).
- `scope`: `"review"` | `"artifact"` | `"located"`. Only `"located"` comments have a non-null `anchor`.
- `critique_type`: `"fix_required"` | `"needs_answer"` | `"note"`.
- `anchor`: `null` unless `scope` is `"located"`. `outdated:true` (and `line_anchor:false`) means the file changed and the quoted lines no longer match — treat the line numbers as stale.
- `author` / `actor`: `{"kind":"human"|"agent","name":…,"icon":…}`. The human is always `"human"` with a `null` icon; an agent carries the name it wrote under. **Check the name before answering** — a comment from another agent is a peer's finding, one under your own name is your own work coming back, and one from `human` is the reviewer.
- `resolved_by`: who claimed the comment addressed, in the same `author` shape; `null` only while the comment is open. Any agent may resolve, so check it before trusting a resolution you did not make.
- `comments[].id` is the **`comment-id` you pass to `comment reply`** / `comment resolve`.
- `replies[].id` is the **`reply-id` you pass to `reply react`** / `reply unreact`.

A `wait` that times out (no new submission yet) emits instead:
```json
{"status":"timeout","submission_version":1}
```
**Almost always pass `--until-round <n>` — the round you expect** (the round you last processed **+ 1**, or `1` for the first wait). If that round has *already* been submitted when you call, `wait` returns its snapshot immediately instead of blocking for the round after it; otherwise it blocks until that round lands. This closes the race where a round arrives between your reply and your re-wait. `submission_version` in every snapshot is the latest round number. `--until-round` is a wake target (state), independent of the `--rounds` content scope above.

Without `--until-round`, `wait` targets the *next* submission past the current count — so calling it right after a round already landed blocks for the round after, not the one you just got. Without `--timeout`, it blocks across rounds until a submission lands (each backend call blocks ~25 s and the launcher re-issues automatically — no work from you). With `--timeout <secs>`, it gives up after that wall-clock budget and prints this timeout line.

`review notify` (`delivered` is how many browsers accepted the push; `0` = nobody opted in)
```json
{"delivered":1,"error":null}
```

`comment reply`
```json
{"reply_id":"0192…","error":null}
```

## The review loop (the core workflow)

1. **Resolve the project.** `project list`, then get the current repo root (`git rev-parse --show-toplevel`) and match it against `projects[].path`. If one matches, use its `id`. **If none matches, stop and ask the human** whether to register it — only on a yes run `suikou project create --name <repo-name> --path <abs-repo-path>`. **Never auto-create a project.** Then decide the files / diff to submit.
2. **Create the review.**
   - file selection: `suikou review create --project <id> --name "<name>" lib/a.ex lib/b.ex README.md`
     - later, adjust the selection without re-listing everything: `suikou review add-files <review-id> lib/c.ex` or `suikou review remove-files <review-id> lib/a.ex`
   - git diff: `suikou review create --project <id> --name "<name>" --diff <base>..<head>`
   - Capture `review_id` from the result.
   - **Show the human the URL.** Run `suikou review url <review-id>` and surface the `url`. Offer to open it; only run `suikou review open <review-id>` if the human says yes — never open unprompted.
3. **Wait for the human.** `suikou review wait <review-id> --until-round 1` (or `suikou wait <review-id> --until-round 1`). This **blocks** until a human submits round 1, then prints the critique snapshot above — or returns at once if that round already landed. Pass `--until-round` with the round you expect; it keeps waiting across rounds with no work from you. Add `--timeout <secs>` only if you want it to give up and print a `timeout` line.
4. **Read & fix.** Walk `artifacts[].comments[]`. Address each one in the code (use `anchor.start_line`/`quote` to locate it, unless `outdated`). Skip comments already `resolved` if you want, but you may still reply.
5. **Reply per addressed comment.** Write your reply markdown to a file and:
   ```
   suikou comment reply <comment-id> --body-file reply.md
   ```
   (or pipe it on stdin). One call per comment.
6. **Re-wait for the next round.** `suikou review wait <review-id> --until-round <last-round + 1>`. Passing the round you expect makes re-waiting **never miss a round** that landed between your reply and this call — it returns that round's snapshot immediately rather than blocking for the one after. Track the round from the snapshot's `submission_version`. Loop back to step 4 until the human approves (`verdict:"approve"` / `approved:true`).

## Reviewing as one of several agents

When you are brought in to **review** a review someone else opened (rather than to answer critique on your own work), name yourself and work the other side of the loop:

1. Pick a name and an icon, and pass `--as <name> --icon <emoji>` on every write below.
2. `suikou review list-files <review-id>` for the paths, then `suikou review export <review-id>` for the comments already there. Read the files themselves from disk — you have the repo.
3. Post each finding with `suikou comment add <review-id> --path lib/a.ex --type fix_required --line 12-14 --body-file finding.md`. Anchor it to the lines it is about; an unanchored finding is much harder to act on.
4. Read the other reviewers' comments before adding your own. If you agree, react rather than restate it. If you disagree, `comment reply` on **their** comment and say why — that is the discussion the human is here to adjudicate.
5. `suikou review wait <review-id>` blocks until the **human** publishes their round — it waits on the review, not on any one comment, so it takes no `--as`. The snapshot it returns drops what an agent already answered; a peer's unanswered finding is still in it.

Two agents converging on the same finding is noise; two agents disagreeing about it in one thread is the point.

## Notifying the human (optional)

`suikou review notify <review-id> --message "<body>"` pushes a notification to every browser the human opted in on (Settings → Notifications). Its title is the review name and clicking it opens that review, so `--message` only carries the body. `delivered` in the result counts the browsers that accepted the push — `0` means nobody opted in (or push isn't set up), so never treat it as the human's acknowledgement, and don't retry on it.

Send one when you hand work back and are about to block: after creating a review, or after finishing a round of replies. It requires notifications enabled on the human's side, which needs the app served over HTTPS (or localhost) — see the README.

### Message templates

| Moment | Command |
|--------|---------|
| New review, first pass | `notify <id> --message "Ready for first look — 6 files, ~240 lines"` |
| Round addressed, re-review | `notify <id> --message "Addressed 5 comments — ready for round 3"` |
| Partly addressed, one open question | `notify <id> --message "Addressed 4 of 5 — need your call on the retry policy"` |
| Blocked on a decision | `notify <id> --message "Blocked: two ways to fix the N+1, need your pick"` |
| Long task finished | `notify <id> --message "Done — all 12 comments addressed, tests green"` |

Writing the body:

- **Never repeat the review name** — the title already carries it, and phone lock screens truncate the body at roughly 80–100 characters.
- **One sentence, with a number.** "Addressed 5 comments" lets the human judge whether to look now; "made some changes" does not.
- **Name what you need**: a look, a pick, a decision. The notification exists to drive their next move.
- Skip pleasantries — they cost characters and add nothing.

Do **not** notify after every `comment reply` (one per round is enough), before a `wait` the human isn't expecting, or as a progress heartbeat. Notification fatigue gets the toggle switched off, and then no ping reaches them at all.

## Boundary — the round and the verdict are the human's (BDR-0018, BDR-0026)

You may author comments (`comment add`), reply, resolve, and react. There is deliberately **no CLI verb** to:

- submit a round,
- submit a verdict or approve.

Those are **human-only**. If a task asks you to "approve" the review, that is out of scope — surface it to the human; do not try to fake it through another command.

When you author critique, you are reviewing someone else's work — hold the same bar the human would. A `comment add` is for a finding you would defend: a bug, a broken invariant, a claim the code does not support. Notes you would not bother a colleague with belong in your final message, not in the review.

Resolving is a claim that the critique was **addressed**, not that you disagree with it. If you think a comment is wrong, reply and say so; leave it open for the human. Your name is recorded on the resolution, so the human can tell your claim from a peer's — and reopen it if they disagree.

`review url`, `review open`, and top-level `open` are **read-only navigation** (they print or open a URL, never author), so they're fine to use — but only open the browser when the human asks.

## Reactions (emoji vocabulary)

A **reaction** is a single emoji an actor puts on a comment or reply — a lightweight signal, not a reply. Humans and agents use **disjoint** vocabularies, and each actor holds **at most one** reaction per comment/reply (picking a new one replaces the old; picking the same one clears it). "Each actor" means each **named** agent: your `--as` reaction is yours, and swapping it never disturbs another agent's on the same target.

**Human** — approval / opposition strength (you only *read* these, never set them):

| emoji | key | meaning |
|-------|-----|---------|
| 💯 | `strong_agree` | strongly agree |
| 👍 | `agree` | agree |
| 👎 | `disagree` | disagree |
| ❌ | `strong_disagree` | strongly oppose |

**Agent** — a free-form work-status signal on anyone's comment or reply. You may use **any** emoji glyph, and you're encouraged to **vary** it: reach for the glyph that best captures *this* moment rather than defaulting to the same one every time. The table below is a starting palette, not a fixed set — a well-chosen 🐛 / 🚧 / 🎉 / 🔍 / 🧪 / ⏳ communicates far more than 👀 on repeat.

| emoji | meaning |
|-------|---------|
| 👀 | seen it, working on it now |
| 🤔 | investigating / unsure |
| 🔍 | digging into the code |
| 🐛 | reproduced / found the bug |
| 🚧 | mid-fix, change in progress |
| 🧪 | testing / verifying |
| ✅ | handled |
| 🎉 | shipped |

Set your reaction on a **comment** with `suikou comment react <comment-id> <emoji>` (the emoji glyph is the positional arg) and clear it with `suikou comment unreact <comment-id>` (emits `{"comment_id":"0192…","error":null}`). React on a specific **reply** with `suikou reply react <reply-id> <emoji>` and clear it with `suikou reply unreact <reply-id>` (emits `{"reply_id":"0192…","error":null}`). Either emits an `error` string on failure — e.g. a missing target, or a human-vocabulary key (💯/👍/👎/❌ are the human's; use an emoji glyph instead). Comment and reply reactions are independent; the agent holds at most one reaction per target.

Intended agent flow: when you pick up a comment, react 👀 so the human sees you're on it; switch to 🤔 / 🔍 while investigating; 🐛 when you reproduce it; 🚧 / 🧪 while fixing and verifying; ✅ or 🎉 when done (usually alongside your `comment reply`). **Move the emoji every time your progress changes** — a reaction that never updates reads as stale, and repeating the same glyph tells the human nothing new. Vary it to match the actual step you're on.

React at the **right granularity**: put the emoji on the whole **comment** while you work the thread, but when your status concerns one specific **reply** (yours or the human's), react on that reply with `reply react <reply-id> <emoji>` so the signal lands where it belongs. Comment and reply reactions are independent, so you can carry one on each. One reaction per target — a new emoji **replaces** the old, so you don't need to unreact between states. Reacting is optional and never a substitute for the reply that carries your actual result.

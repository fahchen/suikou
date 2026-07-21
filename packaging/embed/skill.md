---
name: suikou
description: Drive the Suikou code-review tool from its CLI to run the agent side of a review loop. Create a review over files or a git diff, wait for a human's published critique, read their comments, fix the code, and reply to each addressed comment. Use whenever a task involves submitting work to Suikou for human review or responding to Suikou review feedback.
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
suikou comment reply       <comment-id> (--body <text> | --body-file <path> | stdin)
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
- `comment reply` body sources, in priority order: `--body`, then `--body-file <path>`, then stdin read to EOF. **Prefer `--body-file` or stdin for multi-line markdown** — avoids shell quoting hell.

## Rounds scope

Applies only to `export` and `wait`; controls *which rounds' published comments* the snapshot carries (content scope only — never changes state):

- no flag → `:latest`: the latest round's published critique (matches the human export).
- `--rounds 3` → that single round.
- `--rounds 1-3` → inclusive range.
- `--all` → every round.

`--all` and `--rounds` are mutually exclusive.

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
          "body":"this needs a guard clause",
          "anchor":{"start_line":12,"end_line":14,"quote":"def foo(x)"},
          "original_round":2,
          "resolved_round":null,
          "resolved":false,
          "outdated":false,
          "line_anchor":true,
          "replies":[{"id":"0192…","author":"agent","body":"fixed in round 3"}]
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
- `comments[].id` is the **`comment-id` you pass to `comment reply`**.
- `replies[].id` is the **`reply-id` you pass to `reply react`** / `reply unreact`.

A `wait` that times out (no new submission yet) emits instead:
```json
{"status":"timeout","submission_version":1}
```
Without `--timeout`, `wait` blocks across rounds until a submission lands (each backend call blocks ~25 s and the launcher re-issues automatically — no work from you). With `--timeout <secs>`, it gives up after that wall-clock budget and prints this timeout line.

**`--until-round <n>` — target a specific round (prefer it).** Pass the round you expect (the round you last processed **+ 1**). If that round has *already* been submitted when you call, `wait` returns its snapshot immediately instead of blocking for the round after it; otherwise it blocks until that round lands. This closes the race where a round arrives between your reply and your re-wait. `submission_version` in every snapshot is the latest round number. `--until-round` is a wake target (state), independent of the `--rounds` content scope above.

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

## Boundary — agent may ONLY reply (BDR-0018)

The agent's sole authoring verb is `comment reply` on an **existing** comment. There is deliberately **no CLI verb** to:

- author a top-level comment,
- open/select files *for review* (creating/editing a review's file set is staging your own work, not reviewing — that's allowed),
- submit a verdict or resolve a comment.

Those are **human-only**. If a task asks you to "leave a review comment" or "approve", that is out of scope — surface it to the human; do not try to fake it through another command.

`review url`, `review open`, and top-level `open` are **read-only navigation** (they print or open a URL, never author), so they're fine to use — but only open the browser when the human asks.

## Reactions (emoji vocabulary)

A **reaction** is a single emoji an actor puts on a comment or reply — a lightweight signal, not a reply. Humans and agents use **disjoint** vocabularies, and each actor holds **at most one** reaction per comment/reply (picking a new one replaces the old; picking the same one clears it).

**Human** — approval / opposition strength (you only *read* these, never set them):

| emoji | key | meaning |
|-------|-----|---------|
| 💯 | `strong_agree` | strongly agree |
| 👍 | `agree` | agree |
| 👎 | `disagree` | disagree |
| ❌ | `strong_disagree` | strongly oppose |

**Agent** — a free-form work-status signal on a human's comment. You may use **any** emoji glyph; pick whatever fits the moment. The common convention:

| emoji | meaning |
|-------|---------|
| 👀 | seen it, working on it now |
| 🤔 | investigating / unsure |
| ✅ | handled |

Set your reaction on a **comment** with `suikou comment react <comment-id> <emoji>` (the emoji glyph is the positional arg) and clear it with `suikou comment unreact <comment-id>` (emits `{"comment_id":"0192…","error":null}`). React on a specific **reply** with `suikou reply react <reply-id> <emoji>` and clear it with `suikou reply unreact <reply-id>` (emits `{"reply_id":"0192…","error":null}`). Either emits an `error` string on failure — e.g. a missing target, or a human-vocabulary key (💯/👍/👎/❌ are the human's; use an emoji glyph instead). Comment and reply reactions are independent; the agent holds at most one reaction per target.

Intended agent flow: when you pick up a comment, react 👀 so the human sees you're on it; switch to 🤔 while investigating; ✅ when done (usually alongside your `comment reply`). Move the emoji as your progress changes — and reach for a more specific glyph when it communicates better (🐛 found the bug, 🚧 mid-fix, 🎉 shipped). Use `reply react` when your status concerns a specific reply rather than the whole comment. One reaction per target — a new emoji **replaces** the old, so you don't need to unreact between states. Reacting is optional and never a substitute for the reply that carries your actual result.

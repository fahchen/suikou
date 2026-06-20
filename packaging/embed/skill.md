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
suikou review  create      --project <id> --name <name> --files <a,b,c>
suikou review  create-diff --project <id> --name <name> --base <ref> --head <ref>
suikou review  show        <review-id>
suikou review  files       <review-id>
suikou review  url         <review-id>
suikou review  open        <review-id>
suikou review  rename      <review-id> --name <name>
suikou review  set-files   <review-id> --files <a,b,c>
suikou review  delete      <review-id>
suikou review  export      <review-id> [--rounds <a-b>] [--all]
suikou review  wait        <review-id> [--rounds <a-b>] [--all] [--timeout <secs>]
suikou comment reply       <comment-id> (--body <text> | --body-file <path> | stdin)
suikou wait  <review-id> [...]          # alias for `review wait`
suikou open                             # open the board root in the browser
```

- `--files` is **comma-separated** paths (trimmed; empties dropped), e.g. `--files lib/a.ex,lib/b.ex,README.md`. Paths are relative to the project's root path.
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

`review create` / `review create-diff`
```json
{"review_id":"0192…","error":null}
```

`review show`
```json
{"id":"0192…","name":"Spec","kind":"file_selection","selections":["docs"],"files":[{"path":"doc.md","artifact_id":null}],"error":null}
```

`review files`
```json
{"files":[{"path":"doc.md","artifact_id":null}],"error":null}
```

`review url` / `review open` (`open` also spawns the browser; `suikou open` with no id emits the board root URL the same way). The host/scheme follow the endpoint's configured URL.
```json
{"url":"https://suikou.example/reviews/0192…","error":null}
```

`review rename` / `set-files` / `delete` (`error` is `null` on success, else an error atom string like `"review_not_found"`)
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
          "replies":[{"author":"agent","body":"fixed in round 3"}]
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

A `wait` that times out (no new submission yet) emits instead:
```json
{"status":"timeout","submission_version":1}
```
Without `--timeout`, `wait` blocks across rounds until a submission lands (each backend call blocks ~25 s and the launcher re-issues automatically — no work from you). With `--timeout <secs>`, it gives up after that wall-clock budget and prints this timeout line.

`comment reply`
```json
{"reply_id":"0192…","error":null}
```

## The review loop (the core workflow)

1. **Resolve the project.** `project list`, then get the current repo root (`git rev-parse --show-toplevel`) and match it against `projects[].path`. If one matches, use its `id`. **If none matches, stop and ask the human** whether to register it — only on a yes run `suikou project create --name <repo-name> --path <abs-repo-path>`. **Never auto-create a project.** Then decide the files / diff to submit.
2. **Create the review.**
   - file selection: `suikou review create --project <id> --name "<name>" --files a,b,c`
   - git diff: `suikou review create-diff --project <id> --name "<name>" --base <ref> --head <ref>`
   - Capture `review_id` from the result.
   - **Show the human the URL.** Run `suikou review url <review-id>` and surface the `url`. Offer to open it; only run `suikou review open <review-id>` if the human says yes — never open unprompted.
3. **Wait for the human.** `suikou review wait <review-id>` (or `suikou wait <review-id>`). This **blocks** until a human submits verdicts/comments, then prints the critique snapshot above. It keeps waiting across rounds with no work from you. Add `--timeout <secs>` only if you want it to give up and print a `timeout` line.
4. **Read & fix.** Walk `artifacts[].comments[]`. Address each one in the code (use `anchor.start_line`/`quote` to locate it, unless `outdated`). Skip comments already `resolved` if you want, but you may still reply.
5. **Reply per addressed comment.** Write your reply markdown to a file and:
   ```
   suikou comment reply <comment-id> --body-file reply.md
   ```
   (or pipe it on stdin). One call per comment.
6. **Re-wait for the next round.** `suikou review wait <review-id>` again. The wake is server-managed via the monotonic `submission_version` cursor (captured fresh at the start of each call), so re-waiting **never misses a round** that landed between your calls. Loop back to step 4 until the human approves (`verdict:"approve"` / `approved:true`).

## Boundary — agent may ONLY reply (BDR-0018)

The agent's sole authoring verb is `comment reply` on an **existing** comment. There is deliberately **no CLI verb** to:

- author a top-level comment,
- open/select files *for review* (creating/editing a review's file set is staging your own work, not reviewing — that's allowed),
- submit a verdict or resolve a comment.

Those are **human-only**. If a task asks you to "leave a review comment" or "approve", that is out of scope — surface it to the human; do not try to fake it through another command.

`review url`, `review open`, and top-level `open` are **read-only navigation** (they print or open a URL, never author), so they're fine to use — but only open the browser when the human asks.

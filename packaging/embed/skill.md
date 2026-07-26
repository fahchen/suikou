---
name: suikou
description: Drive a local Suikou review through its CLI. Use when creating or inspecting a Suikou review, waiting for human feedback, addressing or discussing review comments, or adding agent comments, replies, and reactions.
---

# Suikou agent CLI

Use the installed CLI as the source of truth. Begin with `suikou help`; use
`suikou help <group>` or `suikou help <group> <verb>` for the exact arguments
before running an unfamiliar command. Commands call the local server and print
one JSON line to stdout. Failures write to stderr and exit non-zero.

## Runtime and identity

The local server must already be running. If the CLI says it is unavailable,
ask the human to start it. Do not start or restart it unprompted.

Agent-authored write commands require `--as <name>`:

- `comment add`, `comment reply`, and `comment resolve`
- `comment react` and `comment unreact`
- `reply react` and `reply unreact`

Pass one stable name for the entire review; `--icon <emoji>` is optional.
`human` is reserved. `comment reopen` has no author and takes no identity.

## Create or inspect a review

Start with `suikou project list`. Match the current repository root against a
project's `path`. If absent, ask before using `project create`.

Create either a file-selection review or a git-diff review; do not mix them.
Paths are space-separated and relative to the registered project root.

```sh
suikou review create --project <project-id> --name "Review name" lib/a.ex README.md
suikou review create --project <project-id> --name "Review name" --diff main..HEAD
```

Use `review show` or `review list-files` to inspect the selection. `review
set-files` replaces it; `review add-files` and `review remove-files` are
incremental. Use `review url` to give the human the link. `review open` opens
their browser, so run it only when asked.

To join an existing review, run `review list-files` and `review export` first.
Read the reviewed files from the local checkout as well as the exported
snapshot.

## Add discussion

Use `comment add` for a top-level finding. It always needs a review id, a
covered path, a body, and agent identity. Prefer an anchored finding; use
`--review-wide` only when it truly concerns the whole review.

```sh
suikou comment add <review-id> --path lib/a.ex --type fix_required \
  --line 12-14 --as Codex --icon 🤖 --body-file finding.md
suikou comment add <review-id> --path README.md --type note --review-wide \
  --as Codex --body "Clarify the compatibility guarantee."
```

Use `comment reply` to continue a thread; there is no `reply add` command.
For multiline Markdown, prefer `--body-file` or stdin over shell quoting.

```sh
suikou comment reply <comment-id> --as Codex --icon 🤖 --body-file reply.md
suikou comment resolve <comment-id> --as Codex --icon 🤖
suikou comment reopen <comment-id>
```

Resolve only after the critique is addressed. If you disagree, explain why in
a reply and leave it open for the human.

## Reactions

Reactions are lightweight status, not a substitute for a reply. Set one on a
comment or a particular reply, then replace it as the work progresses.

```sh
suikou comment react <comment-id> 👀 --as Codex --icon 🤖
suikou reply react <reply-id> 🧪 --as Codex --icon 🤖
suikou comment unreact <comment-id> --as Codex --icon 🤖
```

Use a meaningful agent emoji such as 👀 (seen), 🔍 (investigating), 🚧
(fixing), 🧪 (verifying), or ✅ (handled). Do not use the human reaction keys
💯, 👍, 👎, or ❌.

## Addressing a human round

1. Wait for the expected submission: `suikou review wait <review-id>
   --until-round <n>`. Start at `1`; after processing a snapshot, wait for
   its `submission_version + 1`. This also returns immediately if that round
   arrived before the command started.
2. Read `artifacts[].comments[]` in the snapshot. A comment id is the target
   for `comment reply`, resolve, and comment reactions; a reply id is the
   target for `reply react` and `reply unreact`.
3. Check `resolved`, `outdated`, `anchor`, `author`, and `resolved_by` before
   acting. Treat an outdated line anchor as stale and locate the current code
   before changing it.
4. Make and verify the change. Reply once per addressed comment with what
   changed, or the reason it was not changed. Resolve only when appropriate.
5. Repeat until the human approves. A timeout result has
   `{"status":"timeout", ...}` and means no new round arrived in the chosen
   window.

Use `review export <review-id>` to inspect a snapshot without waiting. Its
`--rounds` and `--all` flags control returned content; use `--until-round` to
control what `review wait` waits for.

## Multi-agent reviews

Read existing comments before adding a finding. React to an equivalent finding
instead of restating it. Reply in the same thread when you disagree or add
evidence. Keep your own `--as` identity stable so the human can distinguish
agents and see who resolved a comment.

When reviewing another agent's work, post only findings you would defend:
anchor the affected lines, select the appropriate type, and keep the body
actionable. The human is the final adjudicator.

## Human boundaries and handoff

Agents can create comments and replies, resolve or reopen comments, and react.
Only the human submits rounds, sets a verdict, or approves; there is no CLI
command to do those things for them.

Use `review notify <review-id> --message "..."` once when handing work back
or asking for a decision. Delivery count is not acknowledgement, and one
notification per round is enough.

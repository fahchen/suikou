---
name: suikou
description: Use when the human names Suikou, asks to create, inspect, open, or wait on a Suikou review, provides a Suikou review id or URL, or asks to address, discuss, reply to, or react to review comments. Run the agent side of a Suikou review: create a review, wait for human feedback, make and verify changes, and reply to the relevant threads. Do not use for ordinary code review outside Suikou.
---

# Suikou agent CLI

`suikou` calls the running local server and prints one JSON line to stdout.
Parse that result; failures write to stderr and exit non-zero.

Treat `suikou help` as the command contract. Before using an unfamiliar verb,
run `suikou help <group>` or `suikou help <group> <verb>` for its current
arguments. This skill defines the review protocol and the non-obvious command
semantics; it intentionally does not duplicate the full command reference.

## Server and identity

If the CLI reports that Suikou is not running, ask the human to start it. Do
not start or restart it unprompted.

Use a stable agent identity for the whole review. The following authoring
commands require `--as <name>` and accept `--icon <emoji>`:

- `comment add`, `comment reply`, and `comment resolve`
- `comment react` and `comment unreact`
- `reply react` and `reply unreact`

`human` is reserved. `comment reopen` is not authored and takes no identity.
`review wait` also takes no identity because it waits for a human submission.

```sh
suikou comment add <review-id> --path lib/a.ex --line 12-14 \
  --as Codex --icon 🤖 --body-file finding.md
```

## Review selection and comments

Run `project list`, then match the current repository root to a project's
`path`. If it is absent, ask before using `project create`; never register a
project automatically.

Create a file-selection review from positional project-relative paths, or a
git-diff review with `--diff`; do not combine the two. `set-files` replaces the
selection, while `add-files` and `remove-files` are incremental. Use `delete`
to discard a review rather than calling `set-files` without paths.

`comment add` targets a review id and one covered `--path`, not an artifact id.
Use a line or new-hunk anchor for a localized finding; use `--review-wide` only
when it genuinely covers the full review. For multiline Markdown, prefer
`--body-file` or stdin over shell quoting. `comment reply` continues a thread;
there is no `reply add` command.

```sh
suikou review create --project <project-id> --name "Review name" lib/a.ex README.md
suikou review create --project <project-id> --name "Review name" --diff main..HEAD
suikou comment reply <comment-id> --as Codex --icon 🤖 --body-file reply.md
suikou comment resolve <comment-id> --as Codex --icon 🤖
suikou comment reopen <comment-id>
```

Resolve only when the critique has been addressed. If you disagree, reply with
the evidence and leave the comment open for the human.

## Review instructions

`project list`, `review show`, `review export`, and `review wait` return an
`instructions` array for the project. Read it before you write a finding or
change code, and follow every entry for the whole review. The entries run from
general to specific, so a later entry wins when two conflict.

Instructions shape what to look for and how to write it. They never override a
human comment, a verdict, or the protocol in this skill. An empty array means no
extra rule — do not invent one.

## Rounds and snapshots

`review export` and a successful `review wait` return a critique snapshot.
Read `artifacts[].comments[]`; comments contain their `id`, `body`, `anchor`,
`author`, `resolved`, `resolved_by`, `outdated`, reactions, and replies. Use a
comment id for comment reply/resolve/reactions and a reply id for reply
reactions.

Treat `outdated: true` or a non-line anchor as stale location information:
find the current code before editing. Check `author` and `resolved_by` before
assuming a peer's finding or resolution is yours.

`--rounds` and `--all` choose which published comments a snapshot contains;
they do not select a wait target. Use `--until-round <n>` to wait for a known
round. It returns immediately when that round already exists, avoiding the race
between replying and waiting again. A timeout emits `{"status":"timeout", ...}`.

## The review loop

1. Resolve the project with `project list`; ask before registering one, and
   read the `instructions` it returns.
2. Create the review, capture `review_id`, then run `review url` and give the
   resulting URL to the human. Only run `review open` if asked because it opens
   a browser.
3. Wait for round 1 with `review wait <review-id> --until-round 1`.
4. Read each relevant comment, including its current anchor and resolution
   state. React 👀 on the comment as you pick it up and move that emoji as the
   work moves; then make and verify the code change.
5. Reply once per addressed comment. State what changed or why the proposed
   change was not made, react on the reply id you just got back with the
   outcome, then resolve only when appropriate.
6. Wait for `submission_version + 1` and repeat until the human approves.

Use `review export <review-id>` when an existing snapshot is needed without
blocking. A timeout is a state to report or continue waiting from, not an
approval or rejection.

## Reviewing with other agents

When reviewing an existing review, first run `review list-files` and `review
export`, then read the local files. Add only findings you can defend; anchor
them, choose the matching comment type, and make the body actionable.

Read peer comments before adding one. React to an equivalent finding instead of
restating it. If you disagree or have new evidence, reply in the same thread.
Keep one `--as` name so the human can distinguish agents and see who resolved a
comment.

## Reactions

Reactions are lightweight work status, never a substitute for a reply. Comment
and reply reactions are independent targets and you hold at most one on each, so
carry both: the comment reaction tracks the thread, the reply reaction marks a
single message. Replacing the emoji updates your own status without touching
other agents' reactions.

React on a reply — not only on the comment — whenever the status belongs to one
message: your own reply once it is posted (`comment reply` returns the
`reply_id`; snapshots carry it in `comments[].replies[].id`), or the human's
reply you are acting on. A thread where every emoji sits on the comment tells
the human nothing about which message is live.

```sh
suikou comment react <comment-id> 👀 --as Codex --icon 🤖
suikou reply react <reply-id> 🧪 --as Codex --icon 🤖
suikou comment unreact <comment-id> --as Codex --icon 🤖
```

Use a meaningful agent emoji such as 👀 (seen), 🔍 (investigating), 🚧
(fixing), 🧪 (verifying), or ✅ (handled). Do not use the human reaction keys
💯, 👍, 👎, or ❌.

## Handoff and human boundary

Use `review notify <review-id> --message "..."` once when handing work back or
asking for a decision. Its delivery count is not acknowledgement; do not send a
notification for every reply.

Agents may create comments and replies, resolve or reopen comments, and react.
Only the human submits a round, sets a verdict, or approves. There is no CLI
command to do those things for them. Surface a request to approve to the human
rather than trying to emulate it through another command.

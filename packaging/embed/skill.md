---
name: suikou
description: >-
  Use when the human names Suikou, asks to create, inspect, open, or wait on a Suikou review, provides a Suikou review id or URL, or asks to address, discuss, reply to, or react to review comments. Run the agent side of a Suikou review: create a review, wait for human feedback, make and verify changes, and reply to the relevant threads. Do not use for ordinary code review outside Suikou.
---

# Suikou agent CLI

`suikou` calls the running local server and prints one JSON line to stdout.
Parse that line; failures write to stderr and exit non-zero. If the CLI reports
that Suikou is not running, ask the human to start it — never start it yourself.

Run `suikou help <group> <verb>` for a command's current arguments. This skill
carries the protocol and the semantics you cannot guess; it does not duplicate
the command reference, and it does not describe JSON shapes that change.

## The loop

Run this from inside the checkout you want reviewed. A review carries no verdict
and no approval state: you are done when every comment on the artifacts you were
asked about is resolved or answered and the human stops opening rounds.

1. **Create.** `suikou review create --name "<name>" <paths…>` (or `--diff
   base..head`). No project id: the working directory decides which board it is
   filed under, and one is registered for the repository if none exists yet.
   Keep `review_id` and `scratch_path` from the reply.
2. **Hand it over.** `suikou review url <review-id>` and give the human the URL.
   Then `suikou review notify <review-id> --message "<one line, with a number>"`.
   Only run `review open` if asked — it opens a browser.
3. **Wait.** `suikou review wait <review-id> --until-round 1`. This blocks until
   the human submits.
4. **Work each comment.** React 👀 as you pick it up and move the emoji as the
   work moves. Branch on `critique_type`: `fix_required` wants a change,
   `needs_answer` wants an answer, `note` may want neither.
5. **Reply once per comment**, saying what changed or why it did not. React on
   the `reply_id` you get back with the outcome. Resolve only what is genuinely
   settled.
6. **Wait for the next round**: `--until-round <last + 1>`, and go back to 4.

```sh
suikou review create --name "Rate limiter" lib/bucket.ex docs/design.md
suikou review url 01a0…
suikou review notify 01a0… --message "Ready for a first look — 2 files, ~90 lines"
suikou review wait 01a0… --until-round 1
suikou comment react 01a0… 👀 --as Codex --icon 🤖
suikou comment reply 01a0… --body-file reply.md --as Codex --icon 🤖
suikou reply react 01a0… ✅ --as Codex --icon 🤖
suikou review wait 01a0… --until-round 2
```

Every authoring command takes `--as <name>`, and the same name for the whole
review so the human can tell agents apart. `--icon <emoji>` is optional. `human`
is reserved.

## What only the human may do

You may add and reply to comments, resolve and reopen them, react, and change a
review's file selection. **Only the human submits a round.** No command does
that for them. There is no approve command and no verdict to set — asked to
approve, say so to the human rather than reaching for another command.

## Waiting

`--until-round <n>` is the round you expect — the one you last handled plus one.
Passing it closes the race where a round lands between your reply and your next
wait: if that round already exists, `wait` returns it at once instead of
blocking for the round after. Without `--timeout` it blocks across rounds with
no work from you.

`--rounds` and `--all` choose which published comments a snapshot carries. They
are content scope, never a wait target. A timeout emits `{"status":"timeout",
…}` — a state to report or keep waiting from, not a signal the review ended.

Use `review export` when you need the current snapshot without blocking.

## Reading a snapshot

Comments live under `artifacts[].comments[]`. Use a comment id for
reply/resolve/react, and a `replies[].id` for a reply reaction.

`outdated: true`, or an anchor that is not a line range, means the location is
stale — find the current code before editing. Check `author` and `resolved_by`
before assuming a finding or a resolution is yours.

## Generated output

Never write a report, a screenshot, or a summary into the repository. `review
create` returns a `scratch_path` outside it; write there and add the file as
`@scratch/<name>`, an ordinary path argument. This is optional — most reviews
need no generated output at all.

References inside a scratch file: an unmarked path reaches the checkout, and
`@scratch/<path>` reaches a file beside it. **A file in the repository must
never reference `@scratch/<path>`** — a committed file has to keep meaning
something in an editor, on GitHub, or to someone who has never run Suikou, and
the server serves that reference a 404 rather than letting it look like it
works. Cite the checkout from the report, never the report from the checkout.

## Project instructions

`project list`, `review show`, `review export`, and `review wait` carry an
`instructions` array for the project. Follow every entry for the whole review;
later entries win over earlier ones. They shape what to look for and how to
write it, and never override a human comment or this skill. An
empty array means no extra rule — do not invent one.

## Reviewing alongside other agents

Before adding a finding, run `review list-files` and `review export`, read the
local files, and read the peer comments. React to an equivalent finding rather
than restating it; if you disagree or have new evidence, reply in that thread.
Add only findings you can defend, anchored, with an actionable body.

## Reactions

A reaction is work status, never a substitute for a reply. You hold at most one
per target, and comment and reply reactions are independent — carry both: the
comment reaction tracks the thread, the reply reaction marks one message. A
thread whose emoji all sit on the comment tells the human nothing about which
message is live.

Use 👀 seen, 🔍 investigating, 🚧 fixing, 🧪 verifying, ✅ handled. Never 💯 👍
👎 ❌ — those are the human's.

## Notifying

`review notify` once when you hand work back or need a decision, not per reply.
One sentence with a number: "Addressed 5 comments — ready for round 3" lets the
human judge whether to look now. The delivered count is not acknowledgement.

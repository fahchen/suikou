# Script for populating the database. You can run it as:
#
#     mix run priv/repo/seeds.exs
#
# Seeds one artifact through two review rounds so the markdown review UI has a
# realistic surface: rich markdown (headings, a mermaid diagram, a table, a
# fenced code block, a blockquote), line/file/review comments of every critique
# type, a published verdict, a resolved comment, threaded replies, and a
# carried-forward round.

import Ecto.Query

alias Suikou.Artifacts
alias Suikou.Critique
alias Suikou.Projects
alias Suikou.Repo
alias Suikou.Review
alias Suikou.Rounds
alias Suikou.Schemas.Artifact
alias Suikou.Schemas.Comment
alias Suikou.Schemas.Project

# Idempotent: clear prior projects (artifacts/rounds/comments/replies/reviews cascade).
Repo.delete_all(Artifact)
Repo.delete_all(Project)

round_one = """
# Ingest Pipeline Design

Status: **draft** · Owner: data-platform

## Overview

The ingest pipeline accepts raw events, validates them, and writes
normalized rows to the warehouse. It must tolerate bursty traffic and
never drop an accepted event.

## Architecture

```mermaid
flowchart LR
  A[Producer] --> B[Queue]
  B --> C{Validator}
  C -->|ok| D[Writer]
  C -->|bad| E[Dead letter]
```

## Validation rules

| Field     | Rule                    | Required |
| --------- | ----------------------- | -------- |
| `id`      | UUIDv7                  | yes      |
| `ts`      | ISO-8601, not in future | yes      |
| `payload` | <= 256 KiB              | no       |

## Writer

The writer batches rows and commits every 200ms:

```elixir
def write(batch) do
  batch
  |> Enum.map(&normalize/1)
  |> Repo.insert_all(Event, on_conflict: :nothing)
end
```

> Open question: should the dead-letter queue retry automatically,
> or wait for an operator?
"""

# A project is a directory on disk; an artifact is a file selected under it. The
# reviewer scans the project and picks a file, which reads disk into round 0.
seed_dir = Path.expand("priv/repo/seed_project")
file_path = "ingest-pipeline-design.md"
File.rm_rf!(seed_dir)
File.mkdir_p!(seed_dir)
File.write!(Path.join(seed_dir, file_path), round_one)

{:ok, project} = Projects.register_project(%{name: "Data Platform", path: seed_dir})
{:ok, %{artifact: artifact, round: r1}} = Artifacts.create_from_file(project, file_path)

# Round 0 critique — pending until the review is submitted.
{:ok, overview} =
  Critique.add_comment(%{
    round_id: r1.id,
    scope: :line,
    start_line: 7,
    end_line: 9,
    critique_type: :fix_required,
    body: "Define what \"accepted\" means before promising we never drop one."
  })

{:ok, _deadletter} =
  Critique.add_comment(%{
    round_id: r1.id,
    scope: :line,
    start_line: 18,
    end_line: 18,
    critique_type: :note,
    body: "Dead-letter path should emit a metric so we can alert on it."
  })

{:ok, uuid} =
  Critique.add_comment(%{
    round_id: r1.id,
    scope: :line,
    start_line: 25,
    end_line: 25,
    critique_type: :fix_required,
    body: "UUIDv7 isn't supported by our id library yet — pin v4 or add the dep."
  })

{:ok, _writer} =
  Critique.add_comment(%{
    round_id: r1.id,
    scope: :line,
    start_line: 34,
    end_line: 39,
    critique_type: :needs_answer,
    body: "What happens when `insert_all` partially fails mid-batch?"
  })

{:ok, _backpressure} =
  Critique.add_comment(%{
    round_id: r1.id,
    scope: :file,
    critique_type: :note,
    body: "Add a section on backpressure between the queue and the writer."
  })

{:ok, _summary} =
  Critique.add_comment(%{
    round_id: r1.id,
    scope: :review,
    critique_type: :note,
    body: "Solid direction. A couple of blockers on identifiers and durability."
  })

# Submit the round-0 review: publishes the pending comments, records a verdict,
# and opens the draft round 1 (content copied forward, unresolved critique
# carried).
{:ok, %{next_round: r2}} = Review.submit_review(r1.id, :request_changes)

# A thread on the overview blocker, then resolve the dead-letter note.
{:ok, _} =
  Critique.reply_as_agent(overview.id, "Accepted = passed validation and enqueued durably.")

{:ok, _} = Critique.reply_as_human(overview.id, "Good — state that explicitly in the Overview.")
{:ok, _} = Critique.resolve_comment(uuid.id)

# Round 1: the agent edits the file (commit interval changes, shifting later
# lines) and the reviewer re-snapshots, pulling the edit into the draft round and
# re-anchoring the carried critique through the line diff.
round_two = String.replace(round_one, "commits every 200ms", "commits every 100ms")
File.write!(Path.join(seed_dir, file_path), round_two)
{:ok, r2} = Artifacts.resnapshot(r2.id)

# A fresh pending comment on the latest round.
{:ok, _} =
  Critique.add_comment(%{
    round_id: r2.id,
    scope: :line,
    start_line: 14,
    end_line: 19,
    critique_type: :needs_answer,
    body: "Does the validator run before or after the queue durably persists?"
  })

latest = Rounds.latest(artifact.id)
comment_count = Repo.aggregate(from(c in Comment), :count)

IO.puts("""
Seeded artifact #{inspect(artifact.title)} (#{artifact.id})
  rounds: #{latest.number}
  comments: #{comment_count}
""")

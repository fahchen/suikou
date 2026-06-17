defmodule Suikou.Export do
  @moduledoc """
  Read-only export for the agent. Per artifact (`export/1`) it reflects the
  latest round: its snapshot content, its published critique (with thread
  replies), and the artifact's standing verdict — the latest submitted round's
  verdict, since the current round is always an unsubmitted draft (see
  BDR-0014). `export_review/2` aggregates that view across a review's minted
  artifacts for a rounds scope (`:latest` default, an inclusive `{from, to}`
  range, or `:all`), carrying the monotonic `submission_version` poll cursor.
  Pending comments are never included; exporting changes no state.
  """

  import Ecto.Query

  alias Suikou.Artifacts
  alias Suikou.Critique
  alias Suikou.Reads
  alias Suikou.Repo
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.Round
  alias Suikou.Schemas.Submission
  alias Suikou.Submissions

  @typedoc """
  Which rounds an export draws published critique from: `:latest` (the standing
  round only), an inclusive round-number range `{from, to}`, or `:all`.
  """
  @type rounds_scope :: :latest | {pos_integer(), pos_integer()} | :all

  @type anchor_view :: %{
          start_line: pos_integer(),
          end_line: pos_integer(),
          quote: String.t()
        }

  @type comment_view :: %{
          id: Ecto.UUID.t(),
          scope: Comment.scope(),
          critique_type: Comment.critique_type(),
          body: String.t(),
          anchor: anchor_view() | nil,
          original_round: integer() | nil,
          resolved_round: integer() | nil,
          resolved: boolean(),
          outdated: boolean(),
          line_anchor: boolean(),
          replies: [%{author: Reply.author(), body: String.t()}]
        }

  @type t :: %{
          artifact_id: Ecto.UUID.t(),
          title: String.t(),
          round: integer(),
          content: String.t(),
          verdict: Submission.verdict() | nil,
          approved: boolean(),
          approved_round: integer() | nil,
          comments: [comment_view()]
        }

  @type review_export :: %{
          review_id: Ecto.UUID.t(),
          name: String.t(),
          project_id: Ecto.UUID.t(),
          submission_version: non_neg_integer(),
          artifacts: [t()]
        }

  @doc """
  Exports the agent-facing view of an artifact: the latest round's content, its
  published critique with replies, and the latest verdict. Changes no state.

  ## Examples

      Suikou.Export.export(artifact.id)
      #=> {:ok, %{artifact_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", round: 2, verdict: :request_changes, comments: []}}

      Suikou.Export.export("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> {:error, :artifact_not_found}

  """
  @spec export(Ecto.UUID.t()) :: {:ok, t()} | {:error, :artifact_not_found}
  def export(artifact_id) do
    case Repo.get(Artifact, artifact_id) do
      nil -> {:error, :artifact_not_found}
      %Artifact{} = artifact -> {:ok, build(artifact, :latest)}
    end
  end

  @doc """
  Exports the agent-facing view of a whole review: every minted (active)
  artifact's published critique for the requested rounds scope, plus the
  monotonic `submission_version` that drives the poll cursor. The default
  `:latest` scope mirrors `export/1` per artifact (the standing round's
  published critique); `{from, to}` widens it to an inclusive round-number
  range and `:all` walks every round. Changes no state.

  ## Examples

      Suikou.Export.export_review(review.id)
      #=> %{review_id: "0192…", submission_version: 2, artifacts: [%{round: 2, comments: []}]}

      Suikou.Export.export_review(review.id, :all)
      #=> %{review_id: "0192…", submission_version: 2, artifacts: [%{comments: [%{body: "round 1 note"}]}]}

      Suikou.Export.export_review("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> {:error, :review_not_found}

  """
  @spec export_review(Ecto.UUID.t(), rounds_scope()) ::
          review_export() | {:error, :review_not_found}
  def export_review(review_id, scope \\ :latest) do
    case Repo.get(Review, review_id) do
      nil ->
        {:error, :review_not_found}

      %Review{} = review ->
        %{
          review_id: review.id,
          name: review.name,
          project_id: review.project_id,
          submission_version: Submissions.review_submission_count(review.id),
          artifacts: Enum.map(Reads.list_review_artifacts(review.id), &build(&1, scope))
        }
    end
  end

  defp build(artifact, scope) do
    round = Rounds.latest(artifact.id)
    content = Artifacts.read_content_or_nil(artifact.id)
    lines = content && String.split(content, "\n")

    %{
      artifact_id: artifact.id,
      title: artifact.title,
      round: round.number,
      content: content || "",
      verdict: Submissions.latest_verdict_for_artifact(artifact.id),
      approved: not is_nil(artifact.approved_round),
      approved_round: artifact.approved_round,
      comments: published_comments(artifact.id, round, scope, lines)
    }
  end

  defp published_comments(artifact_id, latest_round, scope, lines) do
    from(c in Comment, as: :comment)
    |> where([comment: c], c.status == :published)
    |> scope_rounds(artifact_id, latest_round, scope)
    |> order_by([comment: c], asc: c.id)
    |> preload(replies: ^reply_thread())
    |> Repo.all()
    |> Enum.map(&comment_view(&1, lines))
  end

  defp scope_rounds(query, _artifact_id, latest_round, :latest) do
    where(query, [comment: c], c.round_id == ^latest_round.id)
  end

  defp scope_rounds(query, artifact_id, _latest_round, :all) do
    join_rounds(query, artifact_id)
  end

  defp scope_rounds(query, artifact_id, _latest_round, {from, to}) do
    query
    |> join_rounds(artifact_id)
    |> where([round: r], r.number >= ^from and r.number <= ^to)
  end

  defp join_rounds(query, artifact_id) do
    query
    |> join(:inner, [comment: c], r in Round, as: :round, on: c.round_id == r.id)
    |> where([round: r], r.artifact_id == ^artifact_id)
  end

  defp reply_thread do
    order_by(from(r in Reply, as: :reply), [reply: r], asc: r.id)
  end

  defp comment_view(comment, lines) do
    {anchor, outdated} = Critique.resolve_anchor(comment.anchor, lines)

    %{
      id: comment.id,
      scope: comment.scope,
      critique_type: comment.critique_type,
      body: comment.body,
      anchor: anchor,
      original_round: comment.original_round,
      resolved_round: comment.resolved_round,
      resolved: not is_nil(comment.resolved_round),
      outdated: outdated,
      line_anchor: comment.scope == :located and not outdated,
      replies: Enum.map(comment.replies, &%{author: &1.author, body: &1.body})
    }
  end
end

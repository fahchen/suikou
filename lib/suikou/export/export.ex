defmodule Suikou.Export do
  @moduledoc """
  Read-only export for the agent. Per artifact (`export/1`) it reflects the
  latest round: the published critique visible in that round (with published
  thread replies), and the artifact's standing verdict —
  the latest submitted round's verdict, since the current round is always an
  unsubmitted draft (see BDR-0014). A comment is a single row visible in round N
  when `authored_round <= N` and it is unresolved or resolved in round N or
  later, so a still-open comment shows every round until resolved without being
  copied. `export_review/2` aggregates that view across a review's minted
  artifacts for a rounds scope (`:latest` default, an inclusive `{from, to}`
  range, or `:all`), carrying the monotonic `submission_version` poll cursor.
  Pending comments and pending replies are never included; exporting changes no
  state.
  """

  import Ecto.Query

  alias Suikou.Artifacts
  alias Suikou.Critique
  alias Suikou.Critique.Queries
  alias Suikou.Reads
  alias Suikou.Repo
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.Submission
  alias Suikou.Submissions

  @typedoc """
  Which rounds an export draws published critique from: `:latest` (the standing
  round only), an inclusive round-number range `{from, to}`, or `:all`.
  """
  @type rounds_scope :: :latest | {non_neg_integer(), non_neg_integer()} | :all

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
          authored_round: integer(),
          resolved_round: integer() | nil,
          resolved: boolean(),
          outdated: boolean(),
          answered: boolean(),
          line_anchor: boolean(),
          replies: [%{author: Reply.author(), body: String.t()}]
        }

  @type t :: %{
          artifact_id: Ecto.UUID.t(),
          title: String.t(),
          round: integer(),
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
    # Content is read only to resolve comment anchors against the live file; it
    # is not emitted — the agent already has the repo checked out.
    content = text_content(Artifacts.read_content_or_nil(artifact.id))
    lines = content && String.split(content, "\n")

    %{
      artifact_id: artifact.id,
      title: artifact.title,
      round: round.number,
      verdict: Submissions.latest_verdict_for_artifact(artifact.id),
      approved: not is_nil(artifact.approved_round),
      approved_round: artifact.approved_round,
      comments: published_comments(artifact.id, round, scope, lines)
    }
  end

  # Binary files (e.g. images) carry no scoped comments and can't be embedded in
  # the JSON snapshot — non-UTF-8 bytes would crash the encoder. Treat them as
  # having no reviewable text; the human surface previews them via the asset route.
  defp text_content(content) when is_binary(content) do
    if String.valid?(content), do: content, else: nil
  end

  defp text_content(nil), do: nil

  defp published_comments(artifact_id, latest_round, scope, lines) do
    artifact_id
    |> Queries.Comments.for_artifact()
    |> where([comment: c], c.status == :published)
    |> scope_rounds(latest_round, scope)
    |> order_by([comment: c], asc: c.id)
    |> preload(replies: ^reply_thread())
    |> Repo.all()
    |> Enum.map(&comment_view(&1, lines))
  end

  # A comment is visible in round N when it was authored on or before N and is
  # still unresolved or resolved in round N or later. `:latest` collapses the
  # range to the standing round; `{from, to}` widens it; `:all` drops the filter.
  defp scope_rounds(query, latest_round, :latest) do
    visible_in_range(query, latest_round.number, latest_round.number)
  end

  defp scope_rounds(query, _latest_round, :all), do: query

  defp scope_rounds(query, _latest_round, {from, to}) do
    visible_in_range(query, from, to)
  end

  defp visible_in_range(query, from, to) do
    where(
      query,
      [comment: c],
      c.authored_round <= ^to and (is_nil(c.resolved_round) or c.resolved_round >= ^from)
    )
  end

  defp reply_thread do
    from(r in Reply, as: :reply)
    |> where([reply: r], r.status == :published)
    |> order_by([reply: r], asc: r.id)
  end

  defp comment_view(comment, lines) do
    {anchor, status} = Critique.resolve_anchor(comment.anchor, lines)
    outdated = status == :outdated

    %{
      id: comment.id,
      scope: comment.scope,
      critique_type: comment.critique_type,
      body: comment.body,
      anchor: anchor,
      authored_round: comment.authored_round,
      resolved_round: comment.resolved_round,
      resolved: not is_nil(comment.resolved_round),
      outdated: outdated,
      answered: agent_answered?(comment),
      line_anchor: comment.scope == :located and not outdated,
      replies: Enum.map(comment.replies, &%{author: &1.author, body: &1.body})
    }
  end

  # Whether the agent has the last word in the comment's discussion. The thread
  # is a single row carrying its published replies in order, so the agent has
  # answered when the most recent published reply is theirs; a trailing human
  # reply (or no reply at all) means the human owes the next move.
  defp agent_answered?(comment) do
    match?(%Reply{author: :agent}, List.last(comment.replies))
  end
end

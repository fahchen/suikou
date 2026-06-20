defmodule Suikou.Reads do
  @moduledoc """
  Read-only queries for the human review surface. Unlike `Suikou.Export`
  (agent-facing, latest round, published only), these expose the full reviewer
  view: every artifact, every round, and a round's comments in any status
  (pending included) with their thread replies.
  """

  import Ecto.Query

  alias Suikou.Critique.Queries
  alias Suikou.Repo
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply
  alias Suikou.Schemas.Round

  @doc """
  Lists every artifact, newest first.

  ## Examples

      Suikou.Reads.list_artifacts()
      #=> [%Suikou.Schemas.Artifact{}]

  """
  @spec list_artifacts() :: [Artifact.t()]
  def list_artifacts do
    from(a in Artifact, as: :artifact)
    |> order_by([artifact: a], desc: a.id)
    |> Repo.all()
  end

  @doc """
  Lists the active (not soft-removed) artifacts of a review, ordered by file
  path, for the artifact switcher on the review surface.

  ## Examples

      Suikou.Reads.list_review_artifacts(review.id)
      #=> [%Suikou.Schemas.Artifact{}]

  """
  @spec list_review_artifacts(Ecto.UUID.t()) :: [Artifact.t()]
  def list_review_artifacts(review_id) do
    from(a in Artifact, as: :artifact)
    |> where([artifact: a], a.review_id == ^review_id and is_nil(a.removed_at))
    |> order_by([artifact: a], asc: a.file_path)
    |> Repo.all()
  end

  @doc """
  Fetches an artifact by id, or `nil` when none exists.

  ## Examples

      Suikou.Reads.get_artifact(artifact.id)
      #=> %Suikou.Schemas.Artifact{}

      Suikou.Reads.get_artifact("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> nil

  """
  @spec get_artifact(Ecto.UUID.t()) :: Artifact.t() | nil
  def get_artifact(artifact_id) do
    case Repo.get(Artifact, artifact_id) do
      nil -> nil
      %Artifact{} = artifact -> Repo.preload(artifact, :review)
    end
  end

  @doc """
  Lists an artifact's rounds in ascending number order.

  ## Examples

      Suikou.Reads.list_rounds(artifact.id)
      #=> [%Suikou.Schemas.Round{number: 1}, %Suikou.Schemas.Round{number: 2}]

  """
  @spec list_rounds(Ecto.UUID.t()) :: [Round.t()]
  def list_rounds(artifact_id) do
    from(r in Round, as: :round)
    |> where([round: r], r.artifact_id == ^artifact_id)
    |> order_by([round: r], asc: r.number)
    |> Repo.all()
  end

  @doc """
  Lists the comments visible in a round in any status (pending included), oldest
  first, with their thread replies preloaded in order. A comment is a single row
  visible in round N when it was authored on or before N and is still unresolved
  or resolved in N or later, so an open comment shows in every round until
  resolved without being copied forward.

  ## Examples

      Suikou.Reads.list_comments(round)
      #=> [%Suikou.Schemas.Comment{status: :published}, %Suikou.Schemas.Comment{status: :pending}]

  """
  @spec list_comments(Round.t()) :: [Comment.t()]
  def list_comments(%Round{} = round) do
    round
    |> visible_comments()
    |> order_by([comment: c], asc: c.id)
    |> preload(replies: ^thread_order())
    |> Repo.all()
  end

  @doc """
  Counts the comments visible in a round without loading them, for the round
  summary badge.

  ## Examples

      Suikou.Reads.count_comments(round)
      #=> 3

  """
  @spec count_comments(Round.t()) :: non_neg_integer()
  def count_comments(%Round{} = round) do
    round
    |> visible_comments()
    |> Repo.aggregate(:count)
  end

  @doc """
  Summarises every round number across a whole review: the comment count and
  the still-unresolved count visible in that round, summed over all the review's
  artifacts. Drives the review-wide counts in the round picker, so a round reads
  the same total no matter which file is active.

  A comment is visible in round N when authored on or before N and not yet
  resolved before N; it is unresolved in N when it has no resolution round or one
  later than N.

  ## Examples

      Suikou.Reads.review_round_summaries(review.id)
      #=> [%{number: 0, comment_count: 5, unresolved_count: 2}]

  """
  @spec review_round_summaries(Ecto.UUID.t()) :: [
          %{
            number: non_neg_integer(),
            comment_count: non_neg_integer(),
            unresolved_count: non_neg_integer()
          }
        ]
  def review_round_summaries(review_id) do
    comments =
      from(c in Comment, as: :comment)
      |> join(:inner, [comment: c], r in Round, as: :round, on: c.round_id == r.id)
      |> join(:inner, [round: r], a in Artifact, as: :artifact, on: r.artifact_id == a.id)
      |> where([artifact: a], a.review_id == ^review_id)
      |> select([comment: c], {c.authored_round, c.resolved_round})
      |> Repo.all()

    max_round =
      from(r in Round, as: :round)
      |> join(:inner, [round: r], a in Artifact, as: :artifact, on: r.artifact_id == a.id)
      |> where([artifact: a], a.review_id == ^review_id)
      |> select([round: r], max(r.number))
      |> Repo.one()

    case max_round do
      nil -> []
      max -> Enum.map(0..max, &round_summary(&1, comments))
    end
  end

  defp round_summary(number, comments) do
    visible =
      Enum.filter(comments, fn {authored, resolved} ->
        authored <= number and (is_nil(resolved) or resolved >= number)
      end)

    unresolved =
      Enum.count(visible, fn {_authored, resolved} -> is_nil(resolved) or resolved > number end)

    %{number: number, comment_count: length(visible), unresolved_count: unresolved}
  end

  defp visible_comments(%Round{artifact_id: artifact_id, number: number}) do
    artifact_id
    |> Queries.Comments.for_artifact()
    |> where(
      [comment: c],
      c.authored_round <= ^number and (is_nil(c.resolved_round) or c.resolved_round >= ^number)
    )
  end

  @doc """
  Fetches a comment by id with its thread replies preloaded in order, or `nil`
  when none exists.

  ## Examples

      Suikou.Reads.get_comment(comment.id)
      #=> %Suikou.Schemas.Comment{}

      Suikou.Reads.get_comment("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> nil

  """
  @spec get_comment(Ecto.UUID.t()) :: Comment.t() | nil
  def get_comment(comment_id) do
    Comment
    |> preload(replies: ^thread_order())
    |> Repo.get(comment_id)
  end

  defp thread_order do
    order_by(from(r in Reply, as: :reply), [reply: r], asc: r.id)
  end
end

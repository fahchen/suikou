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
  alias Suikou.ReviewScope
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
  def get_artifact(artifact_id), do: Repo.get(Artifact, artifact_id)

  @doc """
  Resolves the `{review_id, artifact_id}` owning `round_id`, or `{nil, nil}` when
  the round is unknown. The pair scopes a change event to one file's subtree.

  ## Examples

      Suikou.Reads.scope_for_round(round.id)
      #=> {"0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", "0192c9f4-aaaa-bbbb-cccc-1a2b3c4d5e6f"}

      Suikou.Reads.scope_for_round("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> {nil, nil}

  """
  @spec scope_for_round(Ecto.UUID.t()) :: {Ecto.UUID.t() | nil, Ecto.UUID.t() | nil}
  def scope_for_round(round_id) do
    from(r in Round, as: :round)
    |> join(:inner, [round: r], a in Artifact, as: :artifact, on: r.artifact_id == a.id)
    |> where([round: r], r.id == ^round_id)
    |> select([round: r, artifact: a], {a.review_id, r.artifact_id})
    |> Repo.one() || {nil, nil}
  end

  @doc """
  Resolves the `{review_id, artifact_id}` owning `comment_id`, or `{nil, nil}`
  when the comment is unknown.

  ## Examples

      Suikou.Reads.scope_for_comment(comment.id)
      #=> {"0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", "0192c9f4-aaaa-bbbb-cccc-1a2b3c4d5e6f"}

      Suikou.Reads.scope_for_comment("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> {nil, nil}

  """
  @spec scope_for_comment(Ecto.UUID.t()) :: {Ecto.UUID.t() | nil, Ecto.UUID.t() | nil}
  def scope_for_comment(comment_id) do
    {:comment, comment_id}
    |> ReviewScope.comments()
    |> select([artifact: a], {a.review_id, a.id})
    |> Repo.one() || {nil, nil}
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
  Counts, in one query, the comments visible in each of an artifact's
  `round_numbers` for the per-round summary badges. A comment is visible in
  round N when authored on or before N and not resolved before N, so it counts
  in every round it spans; pulling the `{authored, resolved}` pairs once and
  folding beats a per-round count fan-out.

  ## Examples

      Suikou.Reads.artifact_comment_counts(artifact.id, [0, 1])
      #=> %{0 => 2, 1 => 1}

      Suikou.Reads.artifact_comment_counts(artifact.id, [])
      #=> %{}

  """
  @spec artifact_comment_counts(Ecto.UUID.t(), [non_neg_integer()]) ::
          %{non_neg_integer() => non_neg_integer()}
  def artifact_comment_counts(artifact_id, round_numbers) do
    pairs =
      artifact_id
      |> Queries.Comments.for_artifact()
      |> select([comment: c], {c.authored_round, c.resolved_round})
      |> Repo.all()

    Map.new(round_numbers, fn number ->
      {number, Enum.count(pairs, &comment_visible?(&1, number))}
    end)
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
      {:review, review_id}
      |> ReviewScope.comments()
      |> select([comment: c], {c.authored_round, c.resolved_round})
      |> Repo.all()

    max_round =
      review_id
      |> ReviewScope.rounds()
      |> select([round: r], max(r.number))
      |> Repo.one()

    round_summaries_from_pairs(comments, max_round)
  end

  @doc """
  Folds comment `{authored_round, resolved_round}` pairs into per-round summaries
  for rounds `0..max_round`, returning `[]` when `max_round` is `nil`. Shared by
  the SQL-backed `review_round_summaries/1` and the in-memory review aggregate so
  both derive identical counts from the same logic.

  ## Examples

      iex> Suikou.Reads.round_summaries_from_pairs([{0, 1}], 0)
      [%{number: 0, comment_count: 1, unresolved_count: 1}]

      iex> Suikou.Reads.round_summaries_from_pairs([], nil)
      []

  """
  @spec round_summaries_from_pairs(
          [{non_neg_integer(), non_neg_integer() | nil}],
          non_neg_integer() | nil
        ) :: [
          %{
            number: non_neg_integer(),
            comment_count: non_neg_integer(),
            unresolved_count: non_neg_integer()
          }
        ]
  def round_summaries_from_pairs(_pairs, nil), do: []

  def round_summaries_from_pairs(pairs, max_round) do
    Enum.map(0..max_round, &round_summary(&1, pairs))
  end

  defp round_summary(number, comments) do
    visible = Enum.filter(comments, &comment_visible?(&1, number))

    unresolved =
      Enum.count(visible, fn {_authored, resolved} -> is_nil(resolved) or resolved > number end)

    %{number: number, comment_count: length(visible), unresolved_count: unresolved}
  end

  defp comment_visible?({authored, resolved}, number) do
    authored <= number and (is_nil(resolved) or resolved >= number)
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

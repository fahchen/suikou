defmodule Suikou.ReviewScope do
  @moduledoc """
  Cross-domain read infrastructure: composable `Ecto.Query` builders for
  round/comment/reply rows scoped to a whole review (or a single artifact). Like
  `Suikou.Rounds`, this is shared kernel — open to every context. The builders
  return queries only (never hit `Repo`), so callers add their own
  `select`/`where`/aggregate and run them. A `scope` is `{:review, review_id}` or
  `{:artifact, artifact_id}`.
  """

  import Ecto.Query

  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply
  alias Suikou.Schemas.Round

  @typedoc "Restricts a query to a whole review or a single artifact."
  @type scope() :: {:review, Ecto.UUID.t()} | {:artifact, Ecto.UUID.t()}

  @doc """
  Rounds belonging to `review_id`, with `:round` and `:artifact` bindings.

  ## Examples

      Suikou.ReviewScope.rounds(review.id)
      #=> #Ecto.Query<...>

  """
  @spec rounds(Ecto.UUID.t()) :: Ecto.Query.t()
  def rounds(review_id) do
    from(r in Round, as: :round)
    |> join(:inner, [round: r], a in Artifact, as: :artifact, on: r.artifact_id == a.id)
    |> where([artifact: a], a.review_id == ^review_id)
  end

  @doc """
  Comments under `scope`, with `:comment`, `:round`, and `:artifact` bindings.

  ## Examples

      Suikou.ReviewScope.comments({:review, review.id})
      #=> #Ecto.Query<...>

  """
  @spec comments(scope()) :: Ecto.Query.t()
  def comments(scope) do
    from(c in Comment, as: :comment)
    |> join(:inner, [comment: c], r in Round, as: :round, on: c.round_id == r.id)
    |> join(:inner, [round: r], a in Artifact, as: :artifact, on: r.artifact_id == a.id)
    |> scope_where(scope)
  end

  @doc """
  Replies under `scope`, with `:reply`, `:comment`, `:round`, and `:artifact`
  bindings.

  ## Examples

      Suikou.ReviewScope.replies({:artifact, artifact.id})
      #=> #Ecto.Query<...>

  """
  @spec replies(scope()) :: Ecto.Query.t()
  def replies(scope) do
    from(rep in Reply, as: :reply)
    |> join(:inner, [reply: rep], c in Comment, as: :comment, on: rep.comment_id == c.id)
    |> join(:inner, [comment: c], r in Round, as: :round, on: c.round_id == r.id)
    |> join(:inner, [round: r], a in Artifact, as: :artifact, on: r.artifact_id == a.id)
    |> scope_where(scope)
  end

  defp scope_where(query, {:review, review_id}),
    do: where(query, [artifact: a], a.review_id == ^review_id)

  defp scope_where(query, {:artifact, artifact_id}),
    do: where(query, [artifact: a], a.id == ^artifact_id)
end

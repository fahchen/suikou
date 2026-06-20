defmodule Suikou.Critique.Queries.Comments do
  @moduledoc """
  Composable `Ecto.Query` builders over comments. These return queries only and
  never touch `Repo`; callers (the reviewer `Suikou.Reads` surface and the agent
  `Suikou.Export` surface) compose them and run the query themselves.
  """

  import Ecto.Query

  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Round

  @doc """
  Returns the base comment query with its `:comment` binding.

  ## Examples

      iex> %Ecto.Query{} = Suikou.Critique.Queries.Comments.base()

  """
  @spec base() :: Ecto.Query.t()
  def base, do: from(c in Comment, as: :comment)

  @doc """
  Scopes comments to one artifact by joining each comment's round and matching
  the round's `artifact_id`, adding the `:round` binding.

  ## Examples

      iex> %Ecto.Query{} = Suikou.Critique.Queries.Comments.for_artifact("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")

  """
  @spec for_artifact(Ecto.Query.t(), Ecto.UUID.t()) :: Ecto.Query.t()
  def for_artifact(query \\ base(), artifact_id) do
    query
    |> join(:inner, [comment: c], r in Round, as: :round, on: c.round_id == r.id)
    |> where([round: r], r.artifact_id == ^artifact_id)
  end
end

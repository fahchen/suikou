defmodule Suikou.Reviews.Reads do
  @moduledoc """
  Read-only queries for the human review surface. Unlike `Suikou.Reviews.Export`
  (agent-facing, latest round, published only), these expose the full reviewer
  view: every artifact, every round, and a round's comments in any status
  (pending included) with their thread replies.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Reviews.Schemas.Artifact
  alias Suikou.Reviews.Schemas.Comment
  alias Suikou.Reviews.Schemas.Reply
  alias Suikou.Reviews.Schemas.Round

  @doc """
  Lists every artifact, newest first.

  ## Examples

      iex> Suikou.Reviews.Reads.list_artifacts()
      [%Suikou.Reviews.Schemas.Artifact{}]

  """
  @spec list_artifacts() :: [Artifact.t()]
  def list_artifacts do
    Artifact
    |> order_by([a], desc: a.id)
    |> Repo.all()
  end

  @doc """
  Fetches an artifact by id, or `nil` when none exists.

  ## Examples

      iex> Suikou.Reviews.Reads.get_artifact(artifact.id)
      %Suikou.Reviews.Schemas.Artifact{}

      iex> Suikou.Reviews.Reads.get_artifact(999_999)
      nil

  """
  @spec get_artifact(integer()) :: Artifact.t() | nil
  def get_artifact(artifact_id), do: Repo.get(Artifact, artifact_id)

  @doc """
  Lists an artifact's rounds in ascending number order.

  ## Examples

      iex> Suikou.Reviews.Reads.list_rounds(artifact.id)
      [%Suikou.Reviews.Schemas.Round{number: 1}, %Suikou.Reviews.Schemas.Round{number: 2}]

  """
  @spec list_rounds(integer()) :: [Round.t()]
  def list_rounds(artifact_id) do
    Round
    |> where([r], r.artifact_id == ^artifact_id)
    |> order_by([r], asc: r.number)
    |> Repo.all()
  end

  @doc """
  Lists a round's comments in any status (pending included), oldest first, with
  their thread replies preloaded in order.

  ## Examples

      iex> Suikou.Reviews.Reads.list_comments(round.id)
      [%Suikou.Reviews.Schemas.Comment{status: :published}, %Suikou.Reviews.Schemas.Comment{status: :pending}]

  """
  @spec list_comments(integer()) :: [Comment.t()]
  def list_comments(round_id) do
    Comment
    |> where([c], c.round_id == ^round_id)
    |> order_by([c], asc: c.id)
    |> preload(replies: ^thread_order())
    |> Repo.all()
  end

  @doc """
  Fetches a comment by id with its thread replies preloaded in order, or `nil`
  when none exists.

  ## Examples

      iex> Suikou.Reviews.Reads.get_comment(comment.id)
      %Suikou.Reviews.Schemas.Comment{}

      iex> Suikou.Reviews.Reads.get_comment(999_999)
      nil

  """
  @spec get_comment(integer()) :: Comment.t() | nil
  def get_comment(comment_id) do
    Comment
    |> preload(replies: ^thread_order())
    |> Repo.get(comment_id)
  end

  defp thread_order, do: from(r in Reply, order_by: r.id)
end

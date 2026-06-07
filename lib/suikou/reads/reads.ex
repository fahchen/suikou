defmodule Suikou.Reads do
  @moduledoc """
  Read-only queries for the human review surface. Unlike `Suikou.Export`
  (agent-facing, latest round, published only), these expose the full reviewer
  view: every artifact, every round, and a round's comments in any status
  (pending included) with their thread replies.
  """

  import Ecto.Query

  alias Suikou.Reads.Diff
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
  Lists a round's comments in any status (pending included), oldest first, with
  their thread replies preloaded in order.

  ## Examples

      Suikou.Reads.list_comments(round.id)
      #=> [%Suikou.Schemas.Comment{status: :published}, %Suikou.Schemas.Comment{status: :pending}]

  """
  @spec list_comments(Ecto.UUID.t()) :: [Comment.t()]
  def list_comments(round_id) do
    from(c in Comment, as: :comment)
    |> where([comment: c], c.round_id == ^round_id)
    |> order_by([comment: c], asc: c.id)
    |> preload(replies: ^thread_order())
    |> Repo.all()
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

  @doc """
  Diffs two rounds of an artifact for the reviewer: the snapshot text
  difference, the critique state transitions (resolved, added, carried-forward),
  and the change in latest verdict. See `Suikou.Reads.Diff.round_diff/3`.

  ## Examples

      Suikou.Reads.round_diff(artifact.id, 1, 2)
      #=> {:ok, %{resolved: [], added: [], carried_forward: [], text: [], verdict_from: nil, verdict_to: nil}}

  """
  defdelegate round_diff(artifact_id, from_number, to_number), to: Diff

  defp thread_order do
    order_by(from(r in Reply, as: :reply), [reply: r], asc: r.id)
  end
end

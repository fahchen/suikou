defmodule Suikou.Reviews.Comments do
  @moduledoc """
  Authoring and lifecycle of human critique. New comments attach to the latest
  round only; a line-scoped comment captures its quoted source on creation.
  Pending comments are mutable; once published they are frozen against edit and
  deletion but can still be resolved.
  """

  alias Suikou.Repo
  alias Suikou.Reviews.Anchor
  alias Suikou.Reviews.Rounds
  alias Suikou.Reviews.Schemas.Comment

  @doc """
  Adds a pending critique to the latest round. A line-scoped comment captures
  its quoted source. Rejects an unknown or non-latest round.

  ## Examples

      Suikou.Reviews.Comments.add(%{round_id: round.id, scope: :review, critique_type: :note, body: "looks good"})
      #=> {:ok, %Suikou.Reviews.Schemas.Comment{status: :pending}}

      Suikou.Reviews.Comments.add(%{round_id: 999_999, scope: :review, critique_type: :note, body: "x"})
      #=> {:error, :round_not_found}

  """
  @spec add(map()) ::
          {:ok, Comment.t()}
          | {:error, Ecto.Changeset.t() | :round_not_found | :not_latest_round}
  def add(attrs) do
    round = Rounds.get(attrs[:round_id])

    cond do
      is_nil(round) -> {:error, :round_not_found}
      not Rounds.latest?(round) -> {:error, :not_latest_round}
      true -> attrs |> capture_quote(round) |> Comment.author_changeset() |> Repo.insert()
    end
  end

  @doc """
  Edits a pending comment's body. A published comment is immutable.

  ## Examples

      Suikou.Reviews.Comments.edit(comment.id, %{body: "revised", critique_type: :note})
      #=> {:ok, %Suikou.Reviews.Schemas.Comment{body: "revised"}}

      Suikou.Reviews.Comments.edit(published_comment.id, %{body: "nope", critique_type: :note})
      #=> {:error, :published_immutable}

  """
  @spec edit(integer(), map()) ::
          {:ok, Comment.t()}
          | {:error, Ecto.Changeset.t() | :comment_not_found | :published_immutable}
  def edit(comment_id, attrs) do
    with {:ok, comment} <- fetch_pending(comment_id) do
      comment |> Comment.edit_changeset(attrs) |> Repo.update()
    end
  end

  @doc """
  Deletes a pending comment. A published comment cannot be deleted.

  ## Examples

      Suikou.Reviews.Comments.delete(comment.id)
      #=> {:ok, %Suikou.Reviews.Schemas.Comment{}}

      Suikou.Reviews.Comments.delete(published_comment.id)
      #=> {:error, :published_immutable}

  """
  @spec delete(integer()) ::
          {:ok, Comment.t()} | {:error, :comment_not_found | :published_immutable}
  def delete(comment_id) do
    with {:ok, comment} <- fetch_pending(comment_id) do
      Repo.delete(comment)
    end
  end

  @doc """
  Marks a published comment resolved at the latest round. A pending comment
  cannot be resolved.

  ## Examples

      Suikou.Reviews.Comments.resolve(published_comment.id)
      #=> {:ok, %Suikou.Reviews.Schemas.Comment{resolved_round: 1}}

      Suikou.Reviews.Comments.resolve(pending_comment.id)
      #=> {:error, :not_published}

  """
  @spec resolve(integer()) ::
          {:ok, Comment.t()} | {:error, :comment_not_found | :not_published}
  def resolve(comment_id) do
    case Repo.get(Comment, comment_id) do
      nil -> {:error, :comment_not_found}
      %Comment{status: :pending} -> {:error, :not_published}
      %Comment{} = comment -> mark_resolved(comment)
    end
  end

  defp mark_resolved(comment) do
    round = Rounds.get(comment.round_id)
    resolved_round = Rounds.latest_number(round.artifact_id)

    comment
    |> Ecto.Changeset.change(resolved_round: resolved_round)
    |> Repo.update()
  end

  defp fetch_pending(comment_id) do
    case Repo.get(Comment, comment_id) do
      nil -> {:error, :comment_not_found}
      %Comment{status: :published} -> {:error, :published_immutable}
      %Comment{status: :pending} = comment -> {:ok, comment}
    end
  end

  defp capture_quote(attrs, round) do
    start_line = attrs[:start_line]
    end_line = attrs[:end_line]

    if line_scope?(attrs[:scope]) and is_integer(start_line) and is_integer(end_line) do
      Map.put(attrs, :quote, Anchor.capture_quote(round.content, start_line, end_line))
    else
      attrs
    end
  end

  defp line_scope?(scope), do: scope in [:line, "line"]
end

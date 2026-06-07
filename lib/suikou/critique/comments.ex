defmodule Suikou.Critique.Comments do
  @moduledoc """
  Authoring and lifecycle of human critique. New comments attach to the latest
  round only; a line-scoped comment captures its quoted source on creation.
  Pending comments are mutable; once published they are frozen against edit and
  deletion but can still be resolved.
  """

  alias Suikou.Critique.Anchor
  alias Suikou.Repo
  alias Suikou.Rounds
  alias Suikou.Schemas.Comment

  @doc """
  Adds a pending critique to the latest round. A line-scoped comment captures
  its quoted source. Rejects an unknown or non-latest round.

  ## Examples

      Suikou.Critique.Comments.add(%{round_id: round.id, scope: :review, critique_type: :note, body: "looks good"})
      #=> {:ok, %Suikou.Schemas.Comment{status: :pending}}

      Suikou.Critique.Comments.add(%{round_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", scope: :review, critique_type: :note, body: "x"})
      #=> {:error, :round_not_found}

  """
  @spec add(map()) ::
          {:ok, Comment.t()}
          | {:error, Ecto.Changeset.t() | :round_not_found | :not_latest_round}
  def add(params) do
    round = Rounds.get(params[:round_id])

    cond do
      is_nil(round) -> {:error, :round_not_found}
      not Rounds.latest?(round) -> {:error, :not_latest_round}
      true -> params |> put_anchor(round) |> Comment.author_changeset() |> Repo.insert()
    end
  end

  @doc """
  Edits a pending comment's body. A published comment is immutable.

  ## Examples

      Suikou.Critique.Comments.edit(comment.id, %{body: "revised", critique_type: :note})
      #=> {:ok, %Suikou.Schemas.Comment{body: "revised"}}

      Suikou.Critique.Comments.edit(published_comment.id, %{body: "nope", critique_type: :note})
      #=> {:error, :published_immutable}

  """
  @spec edit(Ecto.UUID.t(), map()) ::
          {:ok, Comment.t()}
          | {:error, Ecto.Changeset.t() | :comment_not_found | :published_immutable}
  def edit(comment_id, params) do
    with {:ok, comment} <- fetch_pending(comment_id) do
      comment |> Comment.edit_changeset(params) |> Repo.update()
    end
  end

  @doc """
  Deletes a pending comment. A published comment cannot be deleted.

  ## Examples

      Suikou.Critique.Comments.delete(comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{}}

      Suikou.Critique.Comments.delete(published_comment.id)
      #=> {:error, :published_immutable}

  """
  @spec delete(Ecto.UUID.t()) ::
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

      Suikou.Critique.Comments.resolve(published_comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{resolved_round: 1}}

      Suikou.Critique.Comments.resolve(pending_comment.id)
      #=> {:error, :not_published}

  """
  @spec resolve(Ecto.UUID.t()) ::
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
    |> Comment.resolve_changeset(resolved_round)
    |> Repo.update()
  end

  defp fetch_pending(comment_id) do
    case Repo.get(Comment, comment_id) do
      nil -> {:error, :comment_not_found}
      %Comment{status: :published} -> {:error, :published_immutable}
      %Comment{status: :pending} = comment -> {:ok, comment}
    end
  end

  defp put_anchor(params, round) do
    start_line = params[:start_line]
    end_line = params[:end_line]

    if line_scope?(params[:scope]) and is_integer(start_line) and is_integer(end_line) do
      anchor = Anchor.capture(round.content, start_line, end_line)

      params
      |> Map.put(:anchor, anchor)
      |> Map.put(:original_anchor, anchor)
      |> Map.put(:original_round, round.number)
    else
      params
    end
  end

  defp line_scope?(scope), do: scope in [:line, "line"]
end

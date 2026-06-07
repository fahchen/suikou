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

  @spec add(map()) :: {:ok, Comment.t()} | {:error, Ecto.Changeset.t() | atom()}
  def add(attrs) do
    round = Rounds.get(attrs[:round_id])

    cond do
      is_nil(round) -> {:error, :round_not_found}
      not Rounds.latest?(round) -> {:error, :not_latest_round}
      true -> attrs |> capture_quote(round) |> Comment.author_changeset() |> Repo.insert()
    end
  end

  @spec edit(integer(), map()) :: {:ok, Comment.t()} | {:error, Ecto.Changeset.t() | atom()}
  def edit(comment_id, attrs) do
    with {:ok, comment} <- fetch_pending(comment_id) do
      comment |> Comment.edit_changeset(attrs) |> Repo.update()
    end
  end

  @spec delete(integer()) :: {:ok, Comment.t()} | {:error, atom()}
  def delete(comment_id) do
    with {:ok, comment} <- fetch_pending(comment_id) do
      Repo.delete(comment)
    end
  end

  @spec resolve(integer()) :: {:ok, Comment.t()} | {:error, atom()}
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

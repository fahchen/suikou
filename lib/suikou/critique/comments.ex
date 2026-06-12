defmodule Suikou.Critique.Comments do
  @moduledoc """
  Authoring and lifecycle of human critique. New comments attach to the latest
  round only; a line-scoped comment captures its quoted source on creation.
  Comments stay editable and deletable regardless of status; only `resolve` and
  `unresolve` require a published comment.
  """

  alias Suikou.Artifacts
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
          | {:error,
             Ecto.Changeset.t()
             | :round_not_found
             | :not_latest_round
             | Artifacts.read_content_error()}
  def add(params) do
    round = Rounds.get(params[:round_id])

    cond do
      is_nil(round) ->
        {:error, :round_not_found}

      not Rounds.latest?(round) ->
        {:error, :not_latest_round}

      true ->
        with {:ok, params} <- put_anchor(params, round) do
          params |> Comment.author_changeset() |> Repo.insert()
        end
    end
  end

  @doc """
  Edits a comment's body and critique type, regardless of status.

  ## Examples

      Suikou.Critique.Comments.edit(comment.id, %{body: "revised", critique_type: :note})
      #=> {:ok, %Suikou.Schemas.Comment{body: "revised"}}

      Suikou.Critique.Comments.edit("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", %{body: "x", critique_type: :note})
      #=> {:error, :comment_not_found}

  """
  @spec edit(Ecto.UUID.t(), map()) ::
          {:ok, Comment.t()}
          | {:error, Ecto.Changeset.t() | :comment_not_found}
  def edit(comment_id, params) do
    with {:ok, comment} <- fetch(comment_id) do
      comment |> Comment.edit_changeset(params) |> Repo.update()
    end
  end

  @doc """
  Deletes a comment, regardless of status.

  ## Examples

      Suikou.Critique.Comments.delete(comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{}}

      Suikou.Critique.Comments.delete("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> {:error, :comment_not_found}

  """
  @spec delete(Ecto.UUID.t()) ::
          {:ok, Comment.t()} | {:error, :comment_not_found}
  def delete(comment_id) do
    with {:ok, comment} <- fetch(comment_id) do
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

  @doc """
  Reopens a published comment by clearing its `resolved_round`. A pending comment
  cannot be unresolved; reopening an already-open comment is a no-op.

  ## Examples

      Suikou.Critique.Comments.unresolve(resolved_comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{resolved_round: nil}}

      Suikou.Critique.Comments.unresolve(pending_comment.id)
      #=> {:error, :not_published}

  """
  @spec unresolve(Ecto.UUID.t()) ::
          {:ok, Comment.t()} | {:error, :comment_not_found | :not_published}
  def unresolve(comment_id) do
    case Repo.get(Comment, comment_id) do
      nil -> {:error, :comment_not_found}
      %Comment{status: :pending} -> {:error, :not_published}
      %Comment{} = comment -> comment |> Comment.unresolve_changeset() |> Repo.update()
    end
  end

  @doc """
  Relocates a line-scoped comment to lines `start_line..end_line` of its file,
  re-capturing the quoted source from the live file so live resolution finds it
  again. Rejects a comment that carries no line anchor.

  ## Examples

      Suikou.Critique.Comments.relocate(comment.id, 4, 5)
      #=> {:ok, %Suikou.Schemas.Comment{}}

      Suikou.Critique.Comments.relocate(review_comment.id, 4, 5)
      #=> {:error, :not_line_scoped}

  """
  @spec relocate(Ecto.UUID.t(), pos_integer(), pos_integer()) ::
          {:ok, Comment.t()}
          | {:error,
             Ecto.Changeset.t()
             | :comment_not_found
             | :not_line_scoped
             | Artifacts.read_content_error()}
  def relocate(comment_id, start_line, end_line) do
    case Repo.get(Comment, comment_id) do
      nil ->
        {:error, :comment_not_found}

      %Comment{scope: :line} = comment ->
        round = Rounds.get(comment.round_id)

        with {:ok, content} <- Artifacts.read_content(round.artifact_id) do
          anchor = Anchor.capture(content, start_line, end_line)

          comment
          |> Comment.relocate_changeset(%{anchor: anchor})
          |> Repo.update()
        end

      %Comment{} ->
        {:error, :not_line_scoped}
    end
  end

  defp fetch(comment_id) do
    case Repo.get(Comment, comment_id) do
      nil -> {:error, :comment_not_found}
      %Comment{} = comment -> {:ok, comment}
    end
  end

  defp put_anchor(params, round) do
    start_line = params[:start_line]
    end_line = params[:end_line]

    if line_scope?(params[:scope]) and is_integer(start_line) and is_integer(end_line) do
      with {:ok, content} <- Artifacts.read_content(round.artifact_id) do
        anchor = Anchor.capture(content, start_line, end_line)

        {:ok,
         params
         |> Map.put(:anchor, anchor)
         |> Map.put(:original_anchor, anchor)
         |> Map.put(:original_round, round.number)}
      end
    else
      {:ok, params}
    end
  end

  defp line_scope?(scope), do: scope in [:line, "line"]
end

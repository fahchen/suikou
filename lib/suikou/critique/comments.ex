defmodule Suikou.Critique.Comments do
  @moduledoc """
  Authoring and lifecycle of human critique. New comments attach to the latest
  round only; a `:located` comment captures its quoted source on creation.

  A comment is Draft while pending, Open once published, and Resolved once a
  `resolved_round` is set. Editing is confined to the Draft stage, while
  deletion remains available after publish. Resolving requires an Open comment;
  reopening happens only as a side effect of a human reply (see
  `Suikou.Critique.Discussion`).
  """

  alias Suikou.Artifacts
  alias Suikou.Critique.Anchor
  alias Suikou.Repo
  alias Suikou.Rounds
  alias Suikou.Schemas.Comment

  @doc """
  Adds a pending critique to the latest round. A `:located` comment carries a
  tagged `anchor` payload whose `type` discriminator selects the capture
  strategy (`"line_range"` / `"diff_hunk"` capture the quote from the live
  artifact content; `"element"` packages the client-supplied selector + quote
  verbatim — see BDR-0021). Rejects an unknown or non-latest round.

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
             | :unknown_anchor_type
             | Artifacts.read_content_error()
             | Artifacts.content_source_error()}
  def add(params) do
    round = Rounds.get(params[:round_id])

    cond do
      is_nil(round) ->
        {:error, :round_not_found}

      not Rounds.latest?(round) ->
        {:error, :not_latest_round}

      true ->
        with {:ok, params} <- put_anchor(params, round) do
          params
          |> Map.put(:authored_round, round.number)
          |> Comment.author_changeset()
          |> Repo.insert()
        end
    end
  end

  @doc """
  Edits a Draft (pending) comment's body and critique type. A published comment
  is immutable.

  ## Examples

      Suikou.Critique.Comments.edit(pending_comment.id, %{body: "revised", critique_type: :note})
      #=> {:ok, %Suikou.Schemas.Comment{body: "revised"}}

      Suikou.Critique.Comments.edit(published_comment.id, %{body: "x", critique_type: :note})
      #=> {:error, :not_pending}

  """
  @spec edit(Ecto.UUID.t(), map()) ::
          {:ok, Comment.t()}
          | {:error, Ecto.Changeset.t() | :comment_not_found | :not_pending}
  def edit(comment_id, params) do
    with {:ok, comment} <- fetch_pending(comment_id) do
      comment |> Comment.edit_changeset(params) |> Repo.update()
    end
  end

  @doc """
  Deletes a comment in any lifecycle state.

  ## Examples

      Suikou.Critique.Comments.delete(pending_comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{}}

      Suikou.Critique.Comments.delete(published_comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{}}

  """
  @spec delete(Ecto.UUID.t()) ::
          {:ok, Comment.t()} | {:error, :comment_not_found}
  def delete(comment_id) do
    with {:ok, comment} <- fetch_comment(comment_id) do
      Repo.delete(comment)
    end
  end

  @doc """
  Marks an Open comment resolved at the latest round. Only an Open comment
  (published and not already resolved) can be resolved.

  ## Examples

      Suikou.Critique.Comments.resolve(open_comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{resolved_round: 1}}

      Suikou.Critique.Comments.resolve(pending_comment.id)
      #=> {:error, :not_open}

  """
  @spec resolve(Ecto.UUID.t()) ::
          {:ok, Comment.t()} | {:error, :comment_not_found | :not_open}
  def resolve(comment_id) do
    case Repo.get(Comment, comment_id) do
      nil -> {:error, :comment_not_found}
      %Comment{status: :published, resolved_round: nil} = comment -> mark_resolved(comment)
      %Comment{} -> {:error, :not_open}
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
  Relocates a `:located` comment to a fresh `anchor` payload, re-capturing the
  quoted source from the live file so live resolution finds it again. The
  `anchor` is tagged with the kind discriminator (`%{type: "line_range", ...}`
  today) and the call dispatches on it. Rejects a comment that carries no
  located anchor.

  ## Examples

      Suikou.Critique.Comments.relocate(comment.id, %{type: "line_range", start_line: 4, end_line: 5})
      #=> {:ok, %Suikou.Schemas.Comment{}}

      Suikou.Critique.Comments.relocate(review_comment.id, %{type: "line_range", start_line: 4, end_line: 5})
      #=> {:error, :not_located}

  """
  @spec relocate(Ecto.UUID.t(), map()) ::
          {:ok, Comment.t()}
          | {:error,
             Ecto.Changeset.t()
             | :comment_not_found
             | :not_located
             | :unknown_anchor_type
             | Artifacts.read_content_error()
             | Artifacts.content_source_error()}
  def relocate(comment_id, anchor_params) do
    case Repo.get(Comment, comment_id) do
      nil ->
        {:error, :comment_not_found}

      %Comment{scope: :located} = comment ->
        round = Rounds.get(comment.round_id)

        with {:ok, anchor} <- build_anchor(anchor_params, round) do
          comment
          |> Comment.relocate_changeset(%{anchor: anchor})
          |> Repo.update()
        end

      %Comment{} ->
        {:error, :not_located}
    end
  end

  defp fetch_pending(comment_id) do
    case Repo.get(Comment, comment_id) do
      nil -> {:error, :comment_not_found}
      %Comment{status: :pending} = comment -> {:ok, comment}
      %Comment{} -> {:error, :not_pending}
    end
  end

  defp fetch_comment(comment_id) do
    case Repo.get(Comment, comment_id) do
      nil -> {:error, :comment_not_found}
      %Comment{} = comment -> {:ok, comment}
    end
  end

  defp put_anchor(params, round) do
    if located_scope?(params[:scope]) do
      with {:ok, anchor} <- build_anchor(params[:anchor], round) do
        {:ok, Map.put(params, :anchor, anchor)}
      end
    else
      {:ok, params}
    end
  end

  defp build_anchor(anchor_params, round) do
    case anchor_type(anchor_params) do
      "line_range" -> build_line_range(anchor_params, round)
      "diff_hunk" -> build_diff_hunk(anchor_params, round)
      "element" -> build_element(anchor_params)
      _other -> {:error, :unknown_anchor_type}
    end
  end

  defp build_line_range(anchor_params, round) do
    start_line = anchor_field(anchor_params, :start_line)
    end_line = anchor_field(anchor_params, :end_line)

    with {:ok, content} <- Artifacts.read_content(round.artifact_id) do
      {:ok, Anchor.capture(content, start_line, end_line)}
    end
  end

  # Element anchors are server-opaque: the client picks the selector against the
  # live iframe DOM and ships the matching quote with it (see BDR-0021). The
  # server never reads the HTML to validate or relocate — it just packages the
  # supplied selector/quote into the polymorphic embed.
  defp build_element(anchor_params) do
    selector = anchor_field(anchor_params, :selector)
    quote = anchor_field(anchor_params, :quote)
    {:ok, Anchor.capture_element(selector, quote)}
  end

  defp build_diff_hunk(anchor_params, round) do
    side = side_field(anchor_params)
    start_line = anchor_field(anchor_params, :start_line)
    end_line = anchor_field(anchor_params, :end_line)

    case Artifacts.content_source(round.artifact_id) do
      {:ok, {:inline, diff, "text/x-diff"}} ->
        {:ok, Anchor.capture_diff_hunk(diff, side, start_line, end_line)}

      {:ok, {:file, _path}} ->
        {:error, :unknown_anchor_type}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp anchor_type(%{type: nil}), do: nil
  defp anchor_type(%{type: type}), do: to_string(type)
  defp anchor_type(%{"type" => nil}), do: nil
  defp anchor_type(%{"type" => type}), do: to_string(type)
  defp anchor_type(_other), do: nil

  defp anchor_field(params, key) when is_map(params) do
    Map.get(params, key) || Map.get(params, Atom.to_string(key))
  end

  defp side_field(params) do
    case anchor_field(params, :side) do
      side when side in [:old, :new] -> side
      "old" -> :old
      "new" -> :new
      _other -> nil
    end
  end

  defp located_scope?(scope), do: scope in [:located, "located"]
end

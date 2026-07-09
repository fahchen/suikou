defmodule Suikou.Critique.Reactions do
  @moduledoc """
  Emoji reactions on a comment. A reaction is an emoji an actor applies to a
  comment; both the human reviewer and the agent may react (this deliberately
  extends BDR-0018's "agent may only reply" boundary — reactions carry an `actor`
  so per-emoji counts can exceed one).

  Only the human reaction path is wired here, driven by the UI store command. A
  `(comment_id, emoji, actor)` triple is unique, so a repeated toggle-on is a
  no-op (`on_conflict: :nothing`) rather than a duplicate row; toggle-off deletes
  the matching row. Both paths require an existing comment, so a reaction can
  never mint a top-level comment.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reaction

  @doc """
  Adds a human reaction to a comment, keyed by `emoji` (a string from the store
  payload, validated through the changeset). Idempotent: repeating the same
  emoji leaves a single row. Returns `{:ok, comment_id}` so the facade can scope
  the change event to the comment's file.

  ## Examples

      Suikou.Critique.Reactions.react_as_human(comment.id, "thumbs_up")
      #=> {:ok, comment.id}

      Suikou.Critique.Reactions.react_as_human("00000000-0000-7000-8000-000000000000", "thumbs_up")
      #=> {:error, :comment_not_found}

  """
  @spec react_as_human(Ecto.UUID.t(), String.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :comment_not_found | Ecto.Changeset.t()}
  def react_as_human(comment_id, emoji) do
    case Repo.get(Comment, comment_id) do
      nil ->
        {:error, :comment_not_found}

      %Comment{} ->
        %Reaction{actor: :human}
        |> Reaction.changeset(%{comment_id: comment_id, emoji: emoji})
        |> Repo.insert(on_conflict: :nothing, conflict_target: [:comment_id, :emoji, :actor])
        |> case do
          {:ok, _reaction} -> {:ok, comment_id}
          {:error, changeset} -> {:error, changeset}
        end
    end
  end

  @doc """
  Removes a human reaction from a comment, keyed by `emoji`. A missing reaction
  is a no-op. Returns `{:ok, comment_id}` so the facade can scope the change
  event to the comment's file.

  ## Examples

      Suikou.Critique.Reactions.unreact_as_human(comment.id, "thumbs_up")
      #=> {:ok, comment.id}

      Suikou.Critique.Reactions.unreact_as_human("00000000-0000-7000-8000-000000000000", "thumbs_up")
      #=> {:error, :comment_not_found}

  """
  @spec unreact_as_human(Ecto.UUID.t(), String.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :comment_not_found}
  def unreact_as_human(comment_id, emoji) do
    case Repo.get(Comment, comment_id) do
      nil ->
        {:error, :comment_not_found}

      %Comment{} ->
        from(r in Reaction, as: :reaction)
        |> where([reaction: r], r.comment_id == ^comment_id and r.actor == :human)
        |> where([reaction: r], r.emoji == ^emoji)
        |> Repo.delete_all()

        {:ok, comment_id}
    end
  end
end

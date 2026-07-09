defmodule Suikou.Critique.Reactions do
  @moduledoc """
  Emoji reactions on a comment or a reply. A reaction is an emoji an actor
  applies to a target; both the human reviewer and the agent may react (this
  deliberately extends BDR-0018's "agent may only reply" boundary — reactions
  carry an `actor` so per-emoji counts can exceed one).

  Only the human reaction path is wired here, driven by the UI store command. A
  `(target_id, emoji, actor)` triple is unique per target, so a repeated
  toggle-on is a no-op (`on_conflict: :nothing`) rather than a duplicate row;
  toggle-off deletes the matching row. Every path requires an existing target, so
  a reaction can never mint a comment or reply. The reply paths return the parent
  comment id so the facade scopes the change event to the comment's file.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reaction
  alias Suikou.Schemas.Reply

  # The unique indexes are partial (one per target kind, scoped by `WHERE`), so
  # the `ON CONFLICT` target must repeat the index predicate for SQLite to match
  # it. Ecto passes `{:unsafe_fragment, ...}` through verbatim after `ON CONFLICT`.
  @comment_conflict_target {:unsafe_fragment, "(comment_id, emoji, actor) WHERE reply_id IS NULL"}
  @reply_conflict_target {:unsafe_fragment, "(reply_id, emoji, actor) WHERE comment_id IS NULL"}

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
        |> Repo.insert(on_conflict: :nothing, conflict_target: @comment_conflict_target)
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

  @doc """
  Adds a human reaction to a reply, keyed by `emoji`. Idempotent: repeating the
  same emoji leaves a single row. Returns `{:ok, comment_id}` — the reply's
  parent comment id — so the facade can scope the change event to the comment's
  file.

  ## Examples

      Suikou.Critique.Reactions.react_reply_as_human(reply.id, "thumbs_up")
      #=> {:ok, reply.comment_id}

      Suikou.Critique.Reactions.react_reply_as_human("00000000-0000-7000-8000-000000000000", "thumbs_up")
      #=> {:error, :reply_not_found}

  """
  @spec react_reply_as_human(Ecto.UUID.t(), String.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :reply_not_found | Ecto.Changeset.t()}
  def react_reply_as_human(reply_id, emoji) do
    case Repo.get(Reply, reply_id) do
      nil ->
        {:error, :reply_not_found}

      %Reply{comment_id: comment_id} ->
        %Reaction{actor: :human}
        |> Reaction.changeset(%{reply_id: reply_id, emoji: emoji})
        |> Repo.insert(on_conflict: :nothing, conflict_target: @reply_conflict_target)
        |> case do
          {:ok, _reaction} -> {:ok, comment_id}
          {:error, changeset} -> {:error, changeset}
        end
    end
  end

  @doc """
  Removes a human reaction from a reply, keyed by `emoji`. A missing reaction is
  a no-op. Returns `{:ok, comment_id}` — the reply's parent comment id — so the
  facade can scope the change event to the comment's file.

  ## Examples

      Suikou.Critique.Reactions.unreact_reply_as_human(reply.id, "thumbs_up")
      #=> {:ok, reply.comment_id}

      Suikou.Critique.Reactions.unreact_reply_as_human("00000000-0000-7000-8000-000000000000", "thumbs_up")
      #=> {:error, :reply_not_found}

  """
  @spec unreact_reply_as_human(Ecto.UUID.t(), String.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :reply_not_found}
  def unreact_reply_as_human(reply_id, emoji) do
    case Repo.get(Reply, reply_id) do
      nil ->
        {:error, :reply_not_found}

      %Reply{comment_id: comment_id} ->
        from(r in Reaction, as: :reaction)
        |> where([reaction: r], r.reply_id == ^reply_id and r.actor == :human)
        |> where([reaction: r], r.emoji == ^emoji)
        |> Repo.delete_all()

        {:ok, comment_id}
    end
  end
end

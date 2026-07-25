defmodule Suikou.Critique.Reactions do
  @moduledoc """
  Emoji reactions on a comment or a reply. A reaction is an emoji an actor
  applies to a target; the human reviewer and every reviewing agent may react.

  The human path is driven by the UI store command; the agent path is driven by
  the facade and carries the acting agent's `Suikou.Critique.Identity`, since
  several agents react on one thread. The human reacts from a fixed four-emoji
  vocabulary; an agent reacts with any emoji glyph (a free-form work-status
  signal), both enforced by the changeset.

  Each *identity* holds at most ONE reaction per target: a `(target_id, actor,
  actor_name)` triple is unique, so picking a new emoji REPLACES that agent's
  previous one in place (`on_conflict: {:replace, ...}`) rather than adding a
  row, while a second agent's reaction is a row of its own. Re-picking the same
  emoji is handled by the caller toggling to `unreact_*`, which deletes that
  identity's single row on the target regardless of the emoji passed. Every path
  requires an existing target, so a reaction can never mint a comment or reply.
  The reply paths return the parent comment id so the facade scopes the change
  event to the comment's file.
  """

  import Ecto.Query

  alias Suikou.Critique.Identity
  alias Suikou.Repo
  alias Suikou.ReviewScope
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reaction
  alias Suikou.Schemas.Reply

  # The unique indexes are partial (one per target kind, scoped by `WHERE`) and
  # keyed on `(target, actor, actor_name)`, so the `ON CONFLICT` target must
  # repeat those columns and the index predicate for SQLite to match it. Ecto
  # passes `{:unsafe_fragment, ...}` through verbatim after `ON CONFLICT`.
  @comment_conflict_target {:unsafe_fragment,
                            "(comment_id, actor, actor_name) WHERE reply_id IS NULL"}
  @reply_conflict_target {:unsafe_fragment,
                          "(reply_id, actor, actor_name) WHERE comment_id IS NULL"}

  # On conflict this identity already reacted to this target, so replace the
  # emoji in place (a new emoji supersedes the old one). The icon rides along so
  # an agent that changed its glyph updates it here too. Bump `updated_at` so the
  # row reflects the change.
  @replace_emoji {:replace, [:emoji, :actor_icon, :updated_at]}

  @doc """
  Returns a change cursor for every reaction on a review — a `{count,
  max_updated_at}` pair over the reactions on the review's comments and their
  replies. Unlike a submission count it is not monotonic (deleting a reaction
  lowers the count), so callers compare it for inequality, not growth: any
  differing pair means a reaction was added, removed, or swapped since the last
  read. Drives the poll wake for reaction changes.

  ## Examples

      Suikou.Critique.Reactions.review_reaction_version(review.id)
      #=> {2, ~N[2026-07-14 09:00:00]}

      Suikou.Critique.Reactions.review_reaction_version("00000000-0000-7000-8000-000000000000")
      #=> {0, nil}

  """
  @spec review_reaction_version(Ecto.UUID.t()) :: {non_neg_integer(), NaiveDateTime.t() | nil}
  def review_reaction_version(review_id) do
    # ponytail: updated_at is second-precision, so a swap in the same wall-clock
    # second as an add/remove could hash equal; count catches the add/remove,
    # and human reaction cadence makes a same-second swap-only collision moot.
    comment_ids = select(ReviewScope.comments({:review, review_id}), [comment: c], c.id)
    reply_ids = select(ReviewScope.replies({:review, review_id}), [reply: rp], rp.id)

    query =
      from(r in Reaction,
        where: r.comment_id in subquery(comment_ids) or r.reply_id in subquery(reply_ids),
        select: {count(r.id), max(r.updated_at)}
      )

    Repo.one(query)
  end

  @doc """
  Adds a human reaction to a comment, keyed by `emoji` (a string from the store
  payload, validated through the changeset). The human holds at most one reaction
  per comment, so reacting with a new emoji REPLACES the previous one in place;
  repeating the same emoji leaves a single row. Returns `{:ok, comment_id}` so
  the facade can scope the change event to the comment's file.

  ## Examples

      Suikou.Critique.Reactions.react_as_human(comment.id, "agree")
      #=> {:ok, comment.id}

      Suikou.Critique.Reactions.react_as_human("00000000-0000-7000-8000-000000000000", "agree")
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
        |> Repo.insert(on_conflict: @replace_emoji, conflict_target: @comment_conflict_target)
        |> case do
          {:ok, _reaction} -> {:ok, comment_id}
          {:error, changeset} -> {:error, changeset}
        end
    end
  end

  @doc """
  Removes the human's reaction from a comment. The human holds at most one
  reaction per comment, so this clears it regardless of the `emoji` passed (a
  stale glyph from the client still removes the current reaction). A missing
  reaction is a no-op. Returns `{:ok, comment_id}` so the facade can scope the
  change event to the comment's file.

  ## Examples

      Suikou.Critique.Reactions.unreact_as_human(comment.id, "agree")
      #=> {:ok, comment.id}

      Suikou.Critique.Reactions.unreact_as_human("00000000-0000-7000-8000-000000000000", "agree")
      #=> {:error, :comment_not_found}

  """
  @spec unreact_as_human(Ecto.UUID.t(), String.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :comment_not_found}
  def unreact_as_human(comment_id, _emoji) do
    case Repo.get(Comment, comment_id) do
      nil ->
        {:error, :comment_not_found}

      %Comment{} ->
        from(r in Reaction, as: :reaction)
        |> where([reaction: r], r.comment_id == ^comment_id and r.actor == :human)
        |> Repo.delete_all()

        {:ok, comment_id}
    end
  end

  @doc """
  Adds `identity`'s agent reaction to a comment, keyed by `emoji` (any glyph,
  validated through the changeset). That agent holds at most one reaction per
  comment, so reacting with a new emoji REPLACES its previous one in place;
  repeating the same emoji leaves a single row. Another agent's reaction on the
  same comment is untouched. Returns `{:ok, comment_id}` so the facade can scope
  the change event to the comment's file.

  ## Examples

      Suikou.Critique.Reactions.react_as_agent(comment.id, "👀", %{name: "Codex", icon: "🤖"})
      #=> {:ok, comment.id}

      Suikou.Critique.Reactions.react_as_agent("00000000-0000-7000-8000-000000000000", "👀", %{name: "", icon: ""})
      #=> {:error, :comment_not_found}

  """
  @spec react_as_agent(Ecto.UUID.t(), String.t(), Identity.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :comment_not_found | Ecto.Changeset.t()}
  def react_as_agent(comment_id, emoji, identity) do
    case Repo.get(Comment, comment_id) do
      nil ->
        {:error, :comment_not_found}

      %Comment{} ->
        identity
        |> agent_reaction()
        |> Reaction.changeset(%{comment_id: comment_id, emoji: emoji})
        |> Repo.insert(on_conflict: @replace_emoji, conflict_target: @comment_conflict_target)
        |> case do
          {:ok, _reaction} -> {:ok, comment_id}
          {:error, changeset} -> {:error, changeset}
        end
    end
  end

  @doc """
  Removes `identity`'s reaction from a comment, leaving any other agent's in
  place. That agent holds at most one reaction per comment, so this clears it
  regardless of the `emoji` passed. A missing reaction is a no-op. Returns
  `{:ok, comment_id}` so the facade can scope the change event to the comment's
  file.

  ## Examples

      Suikou.Critique.Reactions.unreact_as_agent(comment.id, "👀", %{name: "Codex", icon: "🤖"})
      #=> {:ok, comment.id}

      Suikou.Critique.Reactions.unreact_as_agent("00000000-0000-7000-8000-000000000000", "👀", %{name: "", icon: ""})
      #=> {:error, :comment_not_found}

  """
  @spec unreact_as_agent(Ecto.UUID.t(), String.t(), Identity.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :comment_not_found}
  def unreact_as_agent(comment_id, _emoji, identity) do
    case Repo.get(Comment, comment_id) do
      nil ->
        {:error, :comment_not_found}

      %Comment{} ->
        from(r in Reaction, as: :reaction)
        |> where(
          [reaction: r],
          r.comment_id == ^comment_id and r.actor == :agent and r.actor_name == ^identity.name
        )
        |> Repo.delete_all()

        {:ok, comment_id}
    end
  end

  @doc """
  Adds a human reaction to a reply, keyed by `emoji`. The human holds at most one
  reaction per reply, so reacting with a new emoji REPLACES the previous one in
  place; repeating the same emoji leaves a single row. Returns `{:ok,
  comment_id}` — the reply's parent comment id — so the facade can scope the
  change event to the comment's file.

  ## Examples

      Suikou.Critique.Reactions.react_reply_as_human(reply.id, "agree")
      #=> {:ok, reply.comment_id}

      Suikou.Critique.Reactions.react_reply_as_human("00000000-0000-7000-8000-000000000000", "agree")
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
        |> Repo.insert(on_conflict: @replace_emoji, conflict_target: @reply_conflict_target)
        |> case do
          {:ok, _reaction} -> {:ok, comment_id}
          {:error, changeset} -> {:error, changeset}
        end
    end
  end

  @doc """
  Removes the human's reaction from a reply. The human holds at most one reaction
  per reply, so this clears it regardless of the `emoji` passed. A missing
  reaction is a no-op. Returns `{:ok, comment_id}` — the reply's parent comment
  id — so the facade can scope the change event to the comment's file.

  ## Examples

      Suikou.Critique.Reactions.unreact_reply_as_human(reply.id, "agree")
      #=> {:ok, reply.comment_id}

      Suikou.Critique.Reactions.unreact_reply_as_human("00000000-0000-7000-8000-000000000000", "agree")
      #=> {:error, :reply_not_found}

  """
  @spec unreact_reply_as_human(Ecto.UUID.t(), String.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :reply_not_found}
  def unreact_reply_as_human(reply_id, _emoji) do
    case Repo.get(Reply, reply_id) do
      nil ->
        {:error, :reply_not_found}

      %Reply{comment_id: comment_id} ->
        from(r in Reaction, as: :reaction)
        |> where([reaction: r], r.reply_id == ^reply_id and r.actor == :human)
        |> Repo.delete_all()

        {:ok, comment_id}
    end
  end

  @doc """
  Adds `identity`'s agent reaction to a reply, keyed by `emoji` (any glyph,
  validated through the changeset). That agent holds at most one reaction per
  reply, so reacting with a new emoji REPLACES its previous one in place;
  repeating the same emoji leaves a single row. Another agent's reaction on the
  same reply is untouched. Returns `{:ok, comment_id}` — the reply's parent
  comment id — so the facade can scope the change event to the comment's file.

  ## Examples

      Suikou.Critique.Reactions.react_reply_as_agent(reply.id, "👀", %{name: "Codex", icon: "🤖"})
      #=> {:ok, reply.comment_id}

      Suikou.Critique.Reactions.react_reply_as_agent("00000000-0000-7000-8000-000000000000", "👀", %{name: "", icon: ""})
      #=> {:error, :reply_not_found}

  """
  @spec react_reply_as_agent(Ecto.UUID.t(), String.t(), Identity.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :reply_not_found | Ecto.Changeset.t()}
  def react_reply_as_agent(reply_id, emoji, identity) do
    case Repo.get(Reply, reply_id) do
      nil ->
        {:error, :reply_not_found}

      %Reply{comment_id: comment_id} ->
        identity
        |> agent_reaction()
        |> Reaction.changeset(%{reply_id: reply_id, emoji: emoji})
        |> Repo.insert(on_conflict: @replace_emoji, conflict_target: @reply_conflict_target)
        |> case do
          {:ok, _reaction} -> {:ok, comment_id}
          {:error, changeset} -> {:error, changeset}
        end
    end
  end

  @doc """
  Removes `identity`'s reaction from a reply, leaving any other agent's in place.
  That agent holds at most one reaction per reply, so this clears it regardless
  of the `emoji` passed. A missing reaction is a no-op. Returns `{:ok,
  comment_id}` — the reply's parent comment id — so the facade can scope the
  change event to the comment's file.

  ## Examples

      Suikou.Critique.Reactions.unreact_reply_as_agent(reply.id, "👀", %{name: "Codex", icon: "🤖"})
      #=> {:ok, reply.comment_id}

      Suikou.Critique.Reactions.unreact_reply_as_agent("00000000-0000-7000-8000-000000000000", "👀", %{name: "", icon: ""})
      #=> {:error, :reply_not_found}

  """
  @spec unreact_reply_as_agent(Ecto.UUID.t(), String.t(), Identity.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :reply_not_found}
  def unreact_reply_as_agent(reply_id, _emoji, identity) do
    case Repo.get(Reply, reply_id) do
      nil ->
        {:error, :reply_not_found}

      %Reply{comment_id: comment_id} ->
        from(r in Reaction, as: :reaction)
        |> where(
          [reaction: r],
          r.reply_id == ^reply_id and r.actor == :agent and r.actor_name == ^identity.name
        )
        |> Repo.delete_all()

        {:ok, comment_id}
    end
  end

  defp agent_reaction(identity) do
    %Reaction{actor: :agent, actor_name: identity.name, actor_icon: identity.icon}
  end
end

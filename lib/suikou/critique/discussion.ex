defmodule Suikou.Critique.Discussion do
  @moduledoc """
  Threaded replies on a comment. The human reviewer authors top-level critique
  (see `Suikou.Critique.Comments`); the agent has no authoring path and reaches a
  thread only through `reply_as_agent/2` (see BDR-0007). Both reply paths require
  an existing comment, so neither can mint a top-level comment.

  Replies are state-gated by the comment's lifecycle. The agent may reply only to
  an Open comment (published, unresolved); a Draft or Resolved target is rejected.
  A human may reply to an Open or Resolved comment — replying to a Resolved one
  auto-reopens it (clearing `resolved_round`) so the thread's last word is the
  human's. A human reply is created pending and publishes on the next submit; an
  agent reply is published immediately. A human may edit or delete only their own
  pending reply; published replies are immutable.
  """

  alias Suikou.Repo
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply

  @doc """
  Appends a human reply to an Open or Resolved comment. A Resolved target is
  auto-reopened first. The reply is created pending.

  ## Examples

      Suikou.Critique.Discussion.reply_as_human(open_comment.id, "noted")
      #=> {:ok, %Suikou.Schemas.Reply{author: :human, status: :pending}}

      Suikou.Critique.Discussion.reply_as_human(pending_comment.id, "noted")
      #=> {:error, :not_published}

  """
  @spec reply_as_human(Ecto.UUID.t(), String.t()) ::
          {:ok, Reply.t()} | {:error, Ecto.Changeset.t() | :comment_not_found | :not_published}
  def reply_as_human(comment_id, body) do
    case Repo.get(Comment, comment_id) do
      nil ->
        {:error, :comment_not_found}

      %Comment{status: :pending} ->
        {:error, :not_published}

      %Comment{status: :published} = comment ->
        Repo.transaction(fn -> append_human_reply(comment, body) end)
    end
  end

  @doc """
  Appends an agent reply to an Open comment (published, unresolved). A Draft or
  Resolved target is rejected. The reply is published immediately.

  ## Examples

      Suikou.Critique.Discussion.reply_as_agent(open_comment.id, "fixed")
      #=> {:ok, %Suikou.Schemas.Reply{author: :agent, status: :published}}

      Suikou.Critique.Discussion.reply_as_agent(resolved_comment.id, "fixed")
      #=> {:error, :not_open}

  """
  @spec reply_as_agent(Ecto.UUID.t(), String.t()) ::
          {:ok, Reply.t()} | {:error, Ecto.Changeset.t() | :comment_not_found | :not_open}
  def reply_as_agent(comment_id, body) do
    case Repo.get(Comment, comment_id) do
      nil ->
        {:error, :comment_not_found}

      %Comment{status: :published, resolved_round: nil} = comment ->
        insert_reply(comment, :agent, :published, body)

      %Comment{} ->
        {:error, :not_open}
    end
  end

  @doc """
  Edits a human's own pending reply. A published reply is immutable.

  ## Examples

      Suikou.Critique.Discussion.edit_reply(pending_reply.id, "revised")
      #=> {:ok, %Suikou.Schemas.Reply{body: "revised"}}

      Suikou.Critique.Discussion.edit_reply(published_reply.id, "revised")
      #=> {:error, :not_editable}

  """
  @spec edit_reply(Ecto.UUID.t(), String.t()) ::
          {:ok, Reply.t()} | {:error, Ecto.Changeset.t() | :reply_not_found | :not_editable}
  def edit_reply(reply_id, body) do
    with {:ok, reply} <- fetch_editable_reply(reply_id) do
      reply |> Reply.edit_changeset(%{body: body}) |> Repo.update()
    end
  end

  @doc """
  Deletes a human's own pending reply. A published reply is immutable.

  ## Examples

      Suikou.Critique.Discussion.delete_reply(pending_reply.id)
      #=> {:ok, %Suikou.Schemas.Reply{}}

      Suikou.Critique.Discussion.delete_reply(published_reply.id)
      #=> {:error, :not_editable}

  """
  @spec delete_reply(Ecto.UUID.t()) ::
          {:ok, Reply.t()} | {:error, :reply_not_found | :not_editable}
  def delete_reply(reply_id) do
    with {:ok, reply} <- fetch_editable_reply(reply_id) do
      Repo.delete(reply)
    end
  end

  defp append_human_reply(comment, body) do
    comment
    |> reopen_if_resolved()
    |> insert_reply!(:human, :pending, body)
  end

  defp reopen_if_resolved(%Comment{resolved_round: nil} = comment), do: comment

  defp reopen_if_resolved(%Comment{} = comment) do
    comment |> Comment.reopen_changeset() |> Repo.update!()
  end

  defp insert_reply(comment, author, status, body) do
    %Reply{author: author, status: status}
    |> Reply.changeset(%{comment_id: comment.id, body: body})
    |> Repo.insert()
  end

  defp insert_reply!(comment, author, status, body) do
    case insert_reply(comment, author, status, body) do
      {:ok, reply} -> reply
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end

  defp fetch_editable_reply(reply_id) do
    case Repo.get(Reply, reply_id) do
      nil -> {:error, :reply_not_found}
      %Reply{author: :human, status: :pending} = reply -> {:ok, reply}
      %Reply{} -> {:error, :not_editable}
    end
  end
end

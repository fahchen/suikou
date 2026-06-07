defmodule Suikou.Reviews.Discussion do
  @moduledoc """
  Threaded replies on a comment. The human reviewer authors top-level critique
  (see `Suikou.Reviews.Comments`); the agent has no authoring path and reaches a
  thread only through `reply_as_agent/2` (see BDR-0007). Both reply paths require
  an existing comment, so neither can mint a top-level comment.
  """

  alias Suikou.Repo
  alias Suikou.Reviews.Schemas.Comment
  alias Suikou.Reviews.Schemas.Reply

  @doc """
  Appends a human reply to an existing comment thread.

  ## Examples

      Suikou.Reviews.Discussion.reply_as_human(comment.id, "noted")
      #=> {:ok, %Suikou.Reviews.Schemas.Reply{author: :human, body: "noted"}}

      Suikou.Reviews.Discussion.reply_as_human("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", "noted")
      #=> {:error, :comment_not_found}

  """
  @spec reply_as_human(Ecto.UUID.t(), String.t()) ::
          {:ok, Reply.t()} | {:error, Ecto.Changeset.t() | :comment_not_found}
  def reply_as_human(comment_id, body), do: reply(comment_id, :human, body)

  @doc """
  Appends an agent reply to an existing comment thread. The agent has no
  top-level authoring path, so this requires an existing comment.

  ## Examples

      Suikou.Reviews.Discussion.reply_as_agent(comment.id, "fixed")
      #=> {:ok, %Suikou.Reviews.Schemas.Reply{author: :agent, body: "fixed"}}

      Suikou.Reviews.Discussion.reply_as_agent("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", "fixed")
      #=> {:error, :comment_not_found}

  """
  @spec reply_as_agent(Ecto.UUID.t(), String.t()) ::
          {:ok, Reply.t()} | {:error, Ecto.Changeset.t() | :comment_not_found}
  def reply_as_agent(comment_id, body), do: reply(comment_id, :agent, body)

  defp reply(comment_id, author, body) do
    case Repo.get(Comment, comment_id) do
      nil ->
        {:error, :comment_not_found}

      %Comment{} ->
        %{comment_id: comment_id, author: author, body: body}
        |> Reply.changeset()
        |> Repo.insert()
    end
  end
end

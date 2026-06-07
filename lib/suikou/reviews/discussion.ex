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

  @spec reply_as_human(integer(), String.t()) ::
          {:ok, Reply.t()} | {:error, Ecto.Changeset.t() | atom()}
  def reply_as_human(comment_id, body), do: reply(comment_id, :human, body)

  @spec reply_as_agent(integer(), String.t()) ::
          {:ok, Reply.t()} | {:error, Ecto.Changeset.t() | atom()}
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

defmodule SuikouWeb.AgentCLI.Comments do
  @moduledoc """
  Agent CLI command for the `comment` group: reply to a comment thread. The
  agent may only reply, never author top-level comments or submit (BDR-0018).
  Reads its JSON payload from stdin and emits a JSON result to stdout (see
  `SuikouWeb.AgentCLI`); on success it broadcasts the review's comment topic so
  an open human thread shows the reply live.
  """

  alias Suikou.Critique
  alias Suikou.Reads
  alias Suikou.Repo
  alias Suikou.Schemas.Reply
  alias SuikouWeb.AgentCLI
  alias SuikouWeb.Stores.CommentBroadcast

  @doc """
  Posts an agent reply from `%{"comment_id", "body"}` and emits `%{reply_id}` or
  `%{error}`. On success, resolves the comment's review and broadcasts its
  comment topic so an open thread refreshes.

  ## Examples

      # stdin: {"comment_id": "0192…", "body": "fixed in round 2"}
      SuikouWeb.AgentCLI.Comments.reply()
      #=> :ok  # emits {"reply_id":"0192…","error":null}

  """
  @spec reply() :: :ok
  def reply do
    payload = AgentCLI.read_payload()
    comment_id = payload["comment_id"]

    reply =
      case Critique.reply_as_agent(comment_id, payload["body"]) do
        {:ok, %Reply{} = reply} ->
          broadcast_comment(comment_id)
          %{reply_id: reply.id, error: nil}

        {:error, reason} ->
          %{reply_id: nil, error: AgentCLI.error(reason)}
      end

    AgentCLI.emit(reply)
  end

  defp broadcast_comment(comment_id) do
    comment = comment_id |> Reads.get_comment() |> Repo.preload(round: :artifact)
    CommentBroadcast.broadcast(comment.round.artifact.review_id)
  end
end

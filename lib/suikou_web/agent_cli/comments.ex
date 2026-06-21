defmodule SuikouWeb.AgentCLI.Comments do
  @moduledoc """
  Agent CLI command for the `comment` group: reply to a comment thread. The
  agent may only reply, never author top-level comments or submit (BDR-0018).
  Reads its JSON payload from stdin and emits a JSON result to stdout (see
  `SuikouWeb.AgentCLI`). `Suikou.Critique` emits the review change event on a
  successful reply, so an open human thread shows the reply live.
  """

  alias Suikou.Critique
  alias Suikou.Schemas.Reply
  alias SuikouWeb.AgentCLI

  @doc """
  Posts an agent reply from `%{"comment_id", "body"}` and emits `%{reply_id}` or
  `%{error}`. `Suikou.Critique.reply_as_agent/2` emits the review change event on
  success so an open thread refreshes.

  ## Examples

      # stdin: {"comment_id": "0192…", "body": "fixed in round 2"}
      SuikouWeb.AgentCLI.Comments.reply()
      #=> :ok  # emits {"reply_id":"0192…","error":null}

  """
  @spec reply() :: :ok
  def reply do
    payload = AgentCLI.read_payload()

    reply =
      case Critique.reply_as_agent(payload["comment_id"], payload["body"]) do
        {:ok, %Reply{} = reply} ->
          %{reply_id: reply.id, error: nil}

        {:error, reason} ->
          %{reply_id: nil, error: AgentCLI.error(reason)}
      end

    AgentCLI.emit(reply)
  end
end

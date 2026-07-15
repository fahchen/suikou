defmodule SuikouWeb.AgentCLI.Replies do
  @moduledoc """
  Agent CLI commands for the `reply` group: set/clear the agent's work-status
  reaction on a reply. Mirrors `SuikouWeb.AgentCLI.Comments` reactions but targets
  a reply rather than a comment, so the agent can signal status on a specific
  reply, not only the parent comment. Each command reads its JSON payload from
  stdin and emits a JSON result to stdout (see `SuikouWeb.AgentCLI`).
  `Suikou.Critique` emits the review change event on success, so an open human
  thread reflects it live.
  """

  alias Suikou.Critique
  alias SuikouWeb.AgentCLI

  @doc """
  Sets the agent's work-status reaction on a reply from `%{"reply_id", "emoji"}`
  and emits `%{reply_id}` or `%{error}`. The agent holds at most one reaction per
  reply, so a new emoji replaces the previous one. `emoji` must be an
  agent-vocabulary key (`eyes` / `thinking` / `check`); a human-vocabulary key is
  rejected. `Suikou.Critique.react_reply_as_agent/2` emits the review change event.

  ## Examples

      # stdin: {"reply_id": "0192…", "emoji": "eyes"}
      SuikouWeb.AgentCLI.Replies.react()
      #=> :ok  # emits {"reply_id":"0192…","error":null}

  """
  @spec react() :: :ok
  def react do
    payload = AgentCLI.read_payload()

    result =
      case Critique.react_reply_as_agent(payload["reply_id"], payload["emoji"]) do
        {:ok, _comment_id} -> %{reply_id: payload["reply_id"], error: nil}
        {:error, reason} -> %{reply_id: nil, error: AgentCLI.error(reason)}
      end

    AgentCLI.emit(result)
  end

  @doc """
  Clears the agent's reaction on a reply from `%{"reply_id"}` and emits
  `%{reply_id}` or `%{error}`. Removing is a no-op when the agent has no reaction
  there.

  ## Examples

      # stdin: {"reply_id": "0192…"}
      SuikouWeb.AgentCLI.Replies.unreact()
      #=> :ok  # emits {"reply_id":"0192…","error":null}

  """
  @spec unreact() :: :ok
  def unreact do
    payload = AgentCLI.read_payload()

    result =
      case Critique.unreact_reply_as_agent(payload["reply_id"], payload["emoji"]) do
        {:ok, _comment_id} -> %{reply_id: payload["reply_id"], error: nil}
        {:error, reason} -> %{reply_id: nil, error: AgentCLI.error(reason)}
      end

    AgentCLI.emit(result)
  end
end

defmodule SuikouWeb.AgentCLI.Replies do
  @moduledoc """
  Agent CLI commands for the `reply` group: set/clear the calling agent's
  work-status reaction on a reply. Mirrors `SuikouWeb.AgentCLI.Comments` reactions
  but targets a reply rather than a comment, so an agent can signal status on a
  specific reply — including another agent's — not only the parent comment. Each
  command takes its JSON payload and returns the JSON result map (see
  `SuikouWeb.AgentCLI`). `Suikou.Critique` emits the review change event on
  success, so an open human thread reflects it live.
  """

  alias Suikou.Critique
  alias SuikouWeb.AgentCLI

  @doc """
  Sets the calling agent's work-status reaction on a reply from `%{"reply_id",
  "emoji"}` and returns `%{reply_id}` or `%{error}`. That agent holds at most one
  reaction per reply, so a new emoji replaces its previous one while another
  agent's stays put. `emoji` may be any emoji glyph (a free-form work-status
  signal — e.g. 👀 / 🤔 / ✅).
  `Suikou.Critique.react_reply_as_agent/3` emits the review change event.

  ## Examples

      SuikouWeb.AgentCLI.Replies.react(%{"reply_id" => "0192…", "emoji" => "👀", "as" => "Codex"})
      #=> %{reply_id: "0192…", error: nil}

  """
  @spec react(AgentCLI.payload()) :: AgentCLI.result()
  def react(payload) do
    with {:ok, identity} <- AgentCLI.identity(payload),
         {:ok, _comment_id} <-
           Critique.react_reply_as_agent(payload["reply_id"], payload["emoji"], identity) do
      %{reply_id: payload["reply_id"], error: nil}
    else
      {:error, reason} -> %{reply_id: nil, error: AgentCLI.error(reason)}
    end
  end

  @doc """
  Clears the calling agent's reaction on a reply from `%{"reply_id"}` and returns
  `%{reply_id}` or `%{error}`. Removing is a no-op when that agent has no
  reaction there, and leaves any other agent's alone.

  ## Examples

      SuikouWeb.AgentCLI.Replies.unreact(%{"reply_id" => "0192…", "as" => "Codex"})
      #=> %{reply_id: "0192…", error: nil}

  """
  @spec unreact(AgentCLI.payload()) :: AgentCLI.result()
  def unreact(payload) do
    with {:ok, identity} <- AgentCLI.identity(payload),
         {:ok, _comment_id} <-
           Critique.unreact_reply_as_agent(payload["reply_id"], payload["emoji"], identity) do
      %{reply_id: payload["reply_id"], error: nil}
    else
      {:error, reason} -> %{reply_id: nil, error: AgentCLI.error(reason)}
    end
  end
end

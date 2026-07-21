defmodule SuikouWeb.AgentCLI.Comments do
  @moduledoc """
  Agent CLI commands for the `comment` group: reply to a comment thread, and
  set/clear the agent's work-status reaction on a comment. The agent may reply
  and react, but never author top-level comments or submit (BDR-0018). Each
  command reads its JSON payload from stdin and emits a JSON result to stdout
  (see `SuikouWeb.AgentCLI`). `Suikou.Critique` emits the review change event on
  success, so an open human thread reflects it live.
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

  @doc """
  Sets the agent's work-status reaction on a comment from `%{"comment_id",
  "emoji"}` and emits `%{comment_id}` or `%{error}`. The agent holds at most one
  reaction per comment, so a new emoji replaces the previous one. `emoji` may be
  any emoji glyph (a free-form work-status signal — e.g. 👀 / 🤔 / ✅);
  `Suikou.Critique.react_as_agent/2` emits the review change event.

  ## Examples

      # stdin: {"comment_id": "0192…", "emoji": "👀"}
      SuikouWeb.AgentCLI.Comments.react()
      #=> :ok  # emits {"comment_id":"0192…","error":null}

  """
  @spec react() :: :ok
  def react do
    payload = AgentCLI.read_payload()

    result =
      case Critique.react_as_agent(payload["comment_id"], payload["emoji"]) do
        {:ok, comment_id} -> %{comment_id: comment_id, error: nil}
        {:error, reason} -> %{comment_id: nil, error: AgentCLI.error(reason)}
      end

    AgentCLI.emit(result)
  end

  @doc """
  Clears the agent's reaction on a comment from `%{"comment_id"}` and emits
  `%{comment_id}` or `%{error}`. Removing is a no-op when the agent has no
  reaction there.

  ## Examples

      # stdin: {"comment_id": "0192…"}
      SuikouWeb.AgentCLI.Comments.unreact()
      #=> :ok  # emits {"comment_id":"0192…","error":null}

  """
  @spec unreact() :: :ok
  def unreact do
    payload = AgentCLI.read_payload()

    result =
      case Critique.unreact_as_agent(payload["comment_id"], payload["emoji"]) do
        {:ok, comment_id} -> %{comment_id: comment_id, error: nil}
        {:error, reason} -> %{comment_id: nil, error: AgentCLI.error(reason)}
      end

    AgentCLI.emit(result)
  end
end

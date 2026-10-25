defmodule SuikouWeb.AgentCLI.Comments do
  @moduledoc """
  Agent CLI commands for the `comment` group: author a top-level comment, reply
  to a thread, resolve or reopen one, and set/clear the agent's work-status
  reaction. An agent reviews alongside the human and alongside other agents, so
  every command carries the caller's `"as"` / `"icon"` identity (see BDR-0026);
  submitting a round stays the human's (BDR-0018). Each command takes its JSON
  payload and returns the JSON result map (see `SuikouWeb.AgentCLI`).
  `Suikou.Critique` emits the review change event on success, so an open human
  thread reflects it live.
  """

  alias Suikou.Critique
  alias Suikou.Reviews
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply
  alias Suikou.Schemas.Review
  alias SuikouWeb.AgentCLI

  @doc """
  Authors a top-level comment from `%{"review_id", "path", "scope",
  "critique_type", "body", "anchor"}` and returns `%{comment_id}` or `%{error}`.
  It attaches to the file's latest round and is published immediately — an agent
  has no draft to submit. `anchor` carries the tagged payload a `:located`
  comment needs (`%{"type" => "line_range", …}`).

  Targets the review and a path rather than an artifact id: a file's artifact is
  minted the first time someone opens it, and a reviewing agent usually gets
  there before the human has opened anything. `Suikou.Critique` resolves the path
  — minting if needed, and rejecting one the review does not cover — in the same
  transaction as the insert.

  ## Examples

      SuikouWeb.AgentCLI.Comments.add(%{"review_id" => "0192…", "path" => "lib/a.ex", "scope" => "located", "critique_type" => "fix_required", "body" => "unclosed file", "anchor" => %{"type" => "line_range", "start_line" => 12, "end_line" => 14}, "as" => "Codex"})
      #=> %{comment_id: "0192…", error: nil}

  """
  @spec add(AgentCLI.payload()) :: AgentCLI.result()
  def add(payload) do
    case author(payload) do
      {:ok, %Comment{} = comment} -> %{comment_id: comment.id, error: nil}
      {:error, reason} -> %{comment_id: nil, error: AgentCLI.error(reason)}
    end
  end

  defp author(payload) do
    with {:ok, identity} <- AgentCLI.identity(payload),
         {:ok, %Review{} = review} <- fetch_review(payload["review_id"]) do
      Critique.add_comment_as_agent(
        review,
        %{
          path: payload["path"],
          scope: payload["scope"],
          critique_type: payload["critique_type"],
          body: payload["body"],
          anchor: payload["anchor"]
        },
        identity
      )
    end
  end

  defp fetch_review(review_id) do
    case Reviews.get_review(review_id) do
      %Review{} = review -> {:ok, review}
      nil -> {:error, :review_not_found}
    end
  end

  @doc """
  Posts an agent reply from `%{"comment_id", "body"}` and returns `%{reply_id}` or
  `%{error}`. The target may be the human's comment or another agent's.
  `Suikou.Critique.reply_as_agent/3` emits the review change event on success so
  an open thread refreshes.

  ## Examples

      SuikouWeb.AgentCLI.Comments.reply(%{"comment_id" => "0192…", "body" => "fixed in round 2", "as" => "Codex"})
      #=> %{reply_id: "0192…", error: nil}

  """
  @spec reply(AgentCLI.payload()) :: AgentCLI.result()
  def reply(payload) do
    with {:ok, identity} <- AgentCLI.identity(payload),
         {:ok, %Reply{} = reply} <-
           Critique.reply_as_agent(payload["comment_id"], payload["body"], identity) do
      %{reply_id: reply.id, error: nil}
    else
      {:error, reason} -> %{reply_id: nil, error: AgentCLI.error(reason)}
    end
  end

  @doc """
  Marks an Open comment resolved from `%{"comment_id"}` and returns
  `%{comment_id}` or `%{error}`. An agent may resolve any comment, its own or
  another reviewer's; the resolution records which agent claimed it addressed,
  and the human still reopens anything they disagree with.

  ## Examples

      SuikouWeb.AgentCLI.Comments.resolve(%{"comment_id" => "0192…", "as" => "Codex"})
      #=> %{comment_id: "0192…", error: nil}

  """
  @spec resolve(AgentCLI.payload()) :: AgentCLI.result()
  def resolve(payload) do
    with {:ok, identity} <- AgentCLI.identity(payload),
         {:ok, %Comment{id: id}} <-
           Critique.resolve_comment_as_agent(payload["comment_id"], identity) do
      %{comment_id: id, error: nil}
    else
      {:error, reason} -> %{comment_id: nil, error: AgentCLI.error(reason)}
    end
  end

  @doc """
  Reopens a Resolved comment from `%{"comment_id"}` and returns `%{comment_id}` or
  `%{error}`.

  ## Examples

      SuikouWeb.AgentCLI.Comments.reopen(%{"comment_id" => "0192…"})
      #=> %{comment_id: "0192…", error: nil}

  """
  @spec reopen(AgentCLI.payload()) :: AgentCLI.result()
  def reopen(payload) do
    lifecycle(payload, &Critique.reopen_comment/1)
  end

  @doc """
  Sets the calling agent's work-status reaction on a comment from
  `%{"comment_id", "emoji"}` and returns `%{comment_id}` or `%{error}`. That agent
  holds at most one reaction per comment, so a new emoji replaces its previous
  one while another agent's stays put. `emoji` may be any emoji glyph (a
  free-form work-status signal — e.g. 👀 / 🤔 / ✅);
  `Suikou.Critique.react_as_agent/3` emits the review change event.

  ## Examples

      SuikouWeb.AgentCLI.Comments.react(%{"comment_id" => "0192…", "emoji" => "👀", "as" => "Codex"})
      #=> %{comment_id: "0192…", error: nil}

  """
  @spec react(AgentCLI.payload()) :: AgentCLI.result()
  def react(payload) do
    with {:ok, identity} <- AgentCLI.identity(payload),
         {:ok, comment_id} <-
           Critique.react_as_agent(payload["comment_id"], payload["emoji"], identity) do
      %{comment_id: comment_id, error: nil}
    else
      {:error, reason} -> %{comment_id: nil, error: AgentCLI.error(reason)}
    end
  end

  @doc """
  Clears the calling agent's reaction on a comment from `%{"comment_id"}` and
  returns `%{comment_id}` or `%{error}`. Removing is a no-op when that agent has no
  reaction there, and leaves any other agent's alone.

  ## Examples

      SuikouWeb.AgentCLI.Comments.unreact(%{"comment_id" => "0192…", "as" => "Codex"})
      #=> %{comment_id: "0192…", error: nil}

  """
  @spec unreact(AgentCLI.payload()) :: AgentCLI.result()
  def unreact(payload) do
    with {:ok, identity} <- AgentCLI.identity(payload),
         {:ok, comment_id} <-
           Critique.unreact_as_agent(payload["comment_id"], payload["emoji"], identity) do
      %{comment_id: comment_id, error: nil}
    else
      {:error, reason} -> %{comment_id: nil, error: AgentCLI.error(reason)}
    end
  end

  defp lifecycle(payload, transition) do
    case transition.(payload["comment_id"]) do
      {:ok, %Comment{id: id}} -> %{comment_id: id, error: nil}
      {:error, reason} -> %{comment_id: nil, error: AgentCLI.error(reason)}
    end
  end
end

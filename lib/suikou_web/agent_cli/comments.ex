defmodule SuikouWeb.AgentCLI.Comments do
  @moduledoc """
  Agent CLI commands for the `comment` group: author a top-level comment, reply
  to a thread, resolve or reopen one, and set/clear the agent's work-status
  reaction. An agent reviews alongside the human and alongside other agents, so
  every command carries the caller's `"as"` / `"icon"` identity (see BDR-0026);
  submitting a round stays the human's (BDR-0018). Each command reads its JSON
  payload from stdin and emits a JSON result to stdout (see `SuikouWeb.AgentCLI`).
  `Suikou.Critique` emits the review change event on success, so an open human
  thread reflects it live.
  """

  alias Suikou.Critique
  alias Suikou.Reviews
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply
  alias Suikou.Schemas.Review
  alias SuikouWeb.AgentCLI

  @doc """
  Authors a top-level comment from `%{"review_id", "path", "scope",
  "critique_type", "body", "anchor"}` and emits `%{comment_id}` or `%{error}`.
  It attaches to the file's latest round and is published immediately — an agent
  has no draft to submit. `anchor` carries the tagged payload a `:located`
  comment needs (`%{"type" => "line_range", …}`).

  Targets the review and a path rather than an artifact id: a file's artifact is
  minted the first time someone opens it, and a reviewing agent usually gets
  there before the human has opened anything. `Suikou.Reviews.open_file/2` mints
  it if needed and returns the existing one otherwise, so this works either way —
  and it rejects a path the review does not cover.

  ## Examples

      # stdin: {"review_id": "0192…", "path": "lib/a.ex", "scope": "located", "critique_type": "fix_required", "body": "unclosed file", "anchor": {"type": "line_range", "start_line": 12, "end_line": 14}, "as": "Codex"}
      SuikouWeb.AgentCLI.Comments.add()
      #=> :ok  # emits {"comment_id":"0192…","error":null}

  """
  @spec add() :: :ok
  def add do
    payload = AgentCLI.read_payload()

    result =
      case author(payload) do
        {:ok, %Comment{} = comment} -> %{comment_id: comment.id, error: nil}
        {:error, reason} -> %{comment_id: nil, error: AgentCLI.error(reason)}
      end

    AgentCLI.emit(result)
  end

  defp author(payload) do
    with {:ok, identity} <- AgentCLI.identity(payload),
         {:ok, %Review{} = review} <- fetch_review(payload["review_id"]),
         {:ok, %Artifact{} = artifact} <- Reviews.open_file(review, payload["path"]) do
      Critique.add_comment_as_agent(
        %{
          artifact_id: artifact.id,
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
  Posts an agent reply from `%{"comment_id", "body"}` and emits `%{reply_id}` or
  `%{error}`. The target may be the human's comment or another agent's.
  `Suikou.Critique.reply_as_agent/3` emits the review change event on success so
  an open thread refreshes.

  ## Examples

      # stdin: {"comment_id": "0192…", "body": "fixed in round 2", "as": "Codex"}
      SuikouWeb.AgentCLI.Comments.reply()
      #=> :ok  # emits {"reply_id":"0192…","error":null}

  """
  @spec reply() :: :ok
  def reply do
    payload = AgentCLI.read_payload()

    result =
      with {:ok, identity} <- AgentCLI.identity(payload),
           {:ok, %Reply{} = reply} <-
             Critique.reply_as_agent(payload["comment_id"], payload["body"], identity) do
        %{reply_id: reply.id, error: nil}
      else
        {:error, reason} -> %{reply_id: nil, error: AgentCLI.error(reason)}
      end

    AgentCLI.emit(result)
  end

  @doc """
  Marks an Open comment resolved from `%{"comment_id"}` and emits
  `%{comment_id}` or `%{error}`. An agent may resolve any comment, its own or
  another reviewer's — resolution records that the critique was addressed, and
  the human still reopens anything they disagree with.

  ## Examples

      # stdin: {"comment_id": "0192…"}
      SuikouWeb.AgentCLI.Comments.resolve()
      #=> :ok  # emits {"comment_id":"0192…","error":null}

  """
  @spec resolve() :: :ok
  def resolve do
    payload = AgentCLI.read_payload()
    AgentCLI.emit(lifecycle(payload, &Critique.resolve_comment/1))
  end

  @doc """
  Reopens a Resolved comment from `%{"comment_id"}` and emits `%{comment_id}` or
  `%{error}`.

  ## Examples

      # stdin: {"comment_id": "0192…"}
      SuikouWeb.AgentCLI.Comments.unresolve()
      #=> :ok  # emits {"comment_id":"0192…","error":null}

  """
  @spec unresolve() :: :ok
  def unresolve do
    payload = AgentCLI.read_payload()
    AgentCLI.emit(lifecycle(payload, &Critique.unresolve_comment/1))
  end

  @doc """
  Sets the calling agent's work-status reaction on a comment from
  `%{"comment_id", "emoji"}` and emits `%{comment_id}` or `%{error}`. That agent
  holds at most one reaction per comment, so a new emoji replaces its previous
  one while another agent's stays put. `emoji` may be any emoji glyph (a
  free-form work-status signal — e.g. 👀 / 🤔 / ✅);
  `Suikou.Critique.react_as_agent/3` emits the review change event.

  ## Examples

      # stdin: {"comment_id": "0192…", "emoji": "👀", "as": "Codex"}
      SuikouWeb.AgentCLI.Comments.react()
      #=> :ok  # emits {"comment_id":"0192…","error":null}

  """
  @spec react() :: :ok
  def react do
    payload = AgentCLI.read_payload()

    result =
      with {:ok, identity} <- AgentCLI.identity(payload),
           {:ok, comment_id} <-
             Critique.react_as_agent(payload["comment_id"], payload["emoji"], identity) do
        %{comment_id: comment_id, error: nil}
      else
        {:error, reason} -> %{comment_id: nil, error: AgentCLI.error(reason)}
      end

    AgentCLI.emit(result)
  end

  @doc """
  Clears the calling agent's reaction on a comment from `%{"comment_id"}` and
  emits `%{comment_id}` or `%{error}`. Removing is a no-op when that agent has no
  reaction there, and leaves any other agent's alone.

  ## Examples

      # stdin: {"comment_id": "0192…", "as": "Codex"}
      SuikouWeb.AgentCLI.Comments.unreact()
      #=> :ok  # emits {"comment_id":"0192…","error":null}

  """
  @spec unreact() :: :ok
  def unreact do
    payload = AgentCLI.read_payload()

    result =
      with {:ok, identity} <- AgentCLI.identity(payload),
           {:ok, comment_id} <-
             Critique.unreact_as_agent(payload["comment_id"], payload["emoji"], identity) do
        %{comment_id: comment_id, error: nil}
      else
        {:error, reason} -> %{comment_id: nil, error: AgentCLI.error(reason)}
      end

    AgentCLI.emit(result)
  end

  defp lifecycle(payload, transition) do
    case transition.(payload["comment_id"]) do
      {:ok, %Comment{id: id}} -> %{comment_id: id, error: nil}
      {:error, reason} -> %{comment_id: nil, error: AgentCLI.error(reason)}
    end
  end
end

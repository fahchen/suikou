defmodule SuikouWeb.AgentCLI.Reviews do
  @moduledoc """
  Agent CLI commands for the `review` group: list, create (file-selection or
  git-diff), inspect, mutate, export, and long-poll reviews. Each reads its JSON
  payload from stdin and emits a JSON result to stdout (see `SuikouWeb.AgentCLI`).
  Board-changing writes broadcast on the board topic so an open human board
  reflects the change live.
  """

  alias Suikou.Export
  alias Suikou.Projects
  alias Suikou.Reviews
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.ReviewSource.FileSelection
  alias Suikou.Schemas.ReviewSource.GitDiff
  alias Suikou.Submissions
  alias SuikouWeb.AgentCLI
  alias SuikouWeb.Stores.BoardBroadcast
  alias SuikouWeb.Stores.CommentBroadcast

  # The longest a single poll call blocks before reporting a timeout, so it
  # returns well within any rpc-level call timeout; bun re-issues until the
  # submission version changes or its own --timeout elapses. Configurable so the
  # timeout branch is testable without a 25 s wait (`config/test.exs`).
  @default_poll_window_ms 25_000

  @doc """
  Emits a project's reviews as `%{reviews: [%{id, name, kind, selections}]}`, or
  `%{reviews: [], error}` when the project is unknown. Reads `%{"project_id"}`.

  ## Examples

      # stdin: {"project_id": "0192…"}
      SuikouWeb.AgentCLI.Reviews.list()
      #=> :ok  # emits {"reviews":[{"id":"0192…","name":"Spec","kind":"file_selection","selections":[]}],"error":null}

  """
  @spec list() :: :ok
  def list do
    payload = AgentCLI.read_payload()

    reply =
      case Projects.get_project(payload["project_id"]) do
        %Project{} = project ->
          %{reviews: Enum.map(Reviews.list_for_project(project), &review_summary/1), error: nil}

        nil ->
          %{reviews: [], error: "project_not_found"}
      end

    AgentCLI.emit(reply)
  end

  @doc """
  Creates a file-selection review from `%{"project_id", "name", "selections"}`
  and emits `%{review_id}` or `%{error}`. Broadcasts the board on success.

  ## Examples

      # stdin: {"project_id": "0192…", "name": "Spec", "selections": ["docs"]}
      SuikouWeb.AgentCLI.Reviews.create()
      #=> :ok  # emits {"review_id":"0192…","error":null}

  """
  @spec create() :: :ok
  def create do
    payload = AgentCLI.read_payload()

    reply =
      with_project(payload["project_id"], fn project ->
        params = %{name: payload["name"], selections: payload["selections"]}
        created_review(Reviews.create_review(project, params))
      end)

    AgentCLI.emit(reply)
  end

  @doc """
  Creates a git-diff review from `%{"project_id", "name", "base_ref", "head_ref"}`
  and emits `%{review_id}` or `%{error}`. Broadcasts the board on success.

  ## Examples

      # stdin: {"project_id": "0192…", "name": "Diff", "base_ref": "main", "head_ref": "topic"}
      SuikouWeb.AgentCLI.Reviews.create_diff()
      #=> :ok  # emits {"review_id":"0192…","error":null}

  """
  @spec create_diff() :: :ok
  def create_diff do
    payload = AgentCLI.read_payload()

    reply =
      with_project(payload["project_id"], fn project ->
        params = %{
          name: payload["name"],
          base_ref: payload["base_ref"],
          head_ref: payload["head_ref"]
        }

        created_review(Reviews.create_diff_review(project, params))
      end)

    AgentCLI.emit(reply)
  end

  @doc """
  Emits a review's metadata and current files from `%{"review_id"}`, or
  `%{error}` when unknown.

  ## Examples

      # stdin: {"review_id": "0192…"}
      SuikouWeb.AgentCLI.Reviews.show()
      #=> :ok  # emits {"id":"0192…","name":"Spec","kind":"file_selection","files":[…],"error":null}

  """
  @spec show() :: :ok
  def show do
    payload = AgentCLI.read_payload()

    reply =
      with_review(payload["review_id"], fn review ->
        Map.merge(review_summary(review), %{files: Reviews.list_files(review), error: nil})
      end)

    AgentCLI.emit(reply)
  end

  @doc """
  Emits a review's current files as `%{files}` from `%{"review_id"}`, or
  `%{files: [], error}` when unknown.

  ## Examples

      # stdin: {"review_id": "0192…"}
      SuikouWeb.AgentCLI.Reviews.files()
      #=> :ok  # emits {"files":[{"path":"doc.md","artifact_id":null,…}],"error":null}

  """
  @spec files() :: :ok
  def files do
    payload = AgentCLI.read_payload()

    reply =
      with_review(
        payload["review_id"],
        fn review -> %{files: Reviews.list_files(review), error: nil} end,
        %{files: [], error: "review_not_found"}
      )

    AgentCLI.emit(reply)
  end

  @doc """
  Renames a review from `%{"review_id", "name"}` and emits `%{error}`.
  Broadcasts the board on success.

  ## Examples

      # stdin: {"review_id": "0192…", "name": "Spec pass"}
      SuikouWeb.AgentCLI.Reviews.rename()
      #=> :ok  # emits {"error":null}

  """
  @spec rename() :: :ok
  def rename do
    payload = AgentCLI.read_payload()
    AgentCLI.emit(mutate(payload["review_id"], &Reviews.rename_review(&1, payload["name"])))
  end

  @doc """
  Replaces a review's file selection from `%{"review_id", "files"}` and emits
  `%{error}`. Broadcasts the board on success.

  ## Examples

      # stdin: {"review_id": "0192…", "files": ["lib", "readme.md"]}
      SuikouWeb.AgentCLI.Reviews.set_files()
      #=> :ok  # emits {"error":null}

  """
  @spec set_files() :: :ok
  def set_files do
    payload = AgentCLI.read_payload()
    AgentCLI.emit(mutate(payload["review_id"], &Reviews.set_selection(&1, payload["files"])))
  end

  @doc """
  Deletes a review from `%{"review_id"}` and emits `%{error}`. Broadcasts the
  board on success.

  ## Examples

      # stdin: {"review_id": "0192…"}
      SuikouWeb.AgentCLI.Reviews.delete()
      #=> :ok  # emits {"error":null}

  """
  @spec delete() :: :ok
  def delete do
    payload = AgentCLI.read_payload()
    AgentCLI.emit(mutate(payload["review_id"], &Reviews.delete_review/1))
  end

  @doc """
  Emits a one-shot critique snapshot for `%{"review_id"}` scoped by the optional
  `"rounds"` key (see `scope/1`), or `%{error}` when the review is unknown.

  ## Examples

      # stdin: {"review_id": "0192…", "rounds": [1, 3]}
      SuikouWeb.AgentCLI.Reviews.export()
      #=> :ok  # emits {"review_id":"0192…","submission_version":2,"artifacts":[…]}

  """
  @spec export() :: :ok
  def export do
    payload = AgentCLI.read_payload()
    AgentCLI.emit(snapshot(payload["review_id"], scope(payload)))
  end

  @doc """
  Long-polls `%{"review_id"}` for a new submission. Subscribes to the review's
  comment topic, captures the current submission count, then blocks up to the
  poll window (~25 s, or the smaller `"timeout_ms"` budget when supplied). On a
  wake that raises the count it emits the `export_review` snapshot for the
  requested rounds scope (carrying the new `submission_version`); otherwise it
  emits `%{status: "timeout", version}`. Emits `%{error: "review_not_found"}`
  when the review is unknown.

  ## Examples

      # stdin: {"review_id": "0192…"}
      SuikouWeb.AgentCLI.Reviews.poll()
      #=> :ok  # emits {"status":"timeout","version":1} or the snapshot on a wake

  """
  @spec poll() :: :ok
  def poll do
    payload = AgentCLI.read_payload()
    review_id = payload["review_id"]
    scope = scope(payload)

    reply =
      with_review(review_id, fn _review ->
        CommentBroadcast.subscribe(review_id)
        version = Submissions.review_submission_count(review_id)
        deadline = System.monotonic_time(:millisecond) + poll_window_ms(payload)
        await(review_id, scope, version, deadline)
      end)

    AgentCLI.emit(reply)
  end

  # The server-configured window caps how long a single call blocks. An optional
  # `"timeout_ms"` in the payload (the launcher's remaining --timeout budget) caps
  # it further, so a short --timeout returns its timeout snapshot without waiting
  # the full window.
  defp poll_window_ms(payload) do
    server = Application.get_env(:suikou, :agent_cli_poll_window_ms, @default_poll_window_ms)

    case payload["timeout_ms"] do
      ms when is_integer(ms) and ms >= 0 -> min(server, ms)
      _absent -> server
    end
  end

  # Blocks for what remains of the poll window. A wake that raised the submission
  # count returns the fresh snapshot; any other wake (or a stale count) keeps
  # waiting within the remaining time; an exhausted window reports a timeout.
  defp await(review_id, scope, version, deadline) do
    timeout = max(deadline - System.monotonic_time(:millisecond), 0)

    receive do
      :comments_changed ->
        case Submissions.review_submission_count(review_id) do
          ^version -> await(review_id, scope, version, deadline)
          newer when newer > version -> snapshot(review_id, scope)
          _stale -> await(review_id, scope, version, deadline)
        end
    after
      timeout -> %{status: "timeout", version: version}
    end
  end

  defp with_project(project_id, fun) do
    case Projects.get_project(project_id) do
      %Project{} = project -> fun.(project)
      nil -> %{review_id: nil, error: "project_not_found"}
    end
  end

  defp created_review({:ok, %Review{} = review}) do
    BoardBroadcast.broadcast()
    %{review_id: review.id, error: nil}
  end

  defp created_review({:error, reason}), do: %{review_id: nil, error: AgentCLI.error(reason)}

  defp mutate(review_id, fun) do
    with_review(review_id, fn review ->
      case fun.(review) do
        {:ok, %Review{}} ->
          BoardBroadcast.broadcast()
          %{error: nil}

        {:error, reason} ->
          %{error: AgentCLI.error(reason)}
      end
    end)
  end

  defp with_review(review_id, fun, not_found \\ %{error: "review_not_found"}) do
    case Reviews.get_review(review_id) do
      %Review{} = review -> fun.(review)
      nil -> not_found
    end
  end

  defp snapshot(review_id, scope) do
    case Export.export_review(review_id, scope) do
      {:error, reason} -> %{error: AgentCLI.error(reason)}
      export -> export
    end
  end

  # The `"rounds"` payload key decodes to an `Export.rounds_scope()`: absent/null
  # is the default latest round; `[from, to]` is an inclusive range; `"all"` is
  # every round. The launcher must emit these exact JSON shapes.
  defp scope(payload) do
    case payload["rounds"] do
      nil -> :latest
      "all" -> :all
      [from, to] -> {from, to}
    end
  end

  defp review_summary(%Review{} = review) do
    {kind, selections} = kind_and_selections(review)

    %{id: review.id, name: review.name, kind: kind, selections: selections}
  end

  defp kind_and_selections(%Review{source: %FileSelection{selection_paths: paths}}) do
    {:file_selection, paths}
  end

  defp kind_and_selections(%Review{source: %GitDiff{}}), do: {:git_diff, []}
end

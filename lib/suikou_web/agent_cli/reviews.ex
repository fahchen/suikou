defmodule SuikouWeb.AgentCLI.Reviews do
  @moduledoc """
  Agent CLI commands for the `review` group: list, create (file-selection or
  git-diff), inspect, mutate, export, and long-poll reviews. Each takes its JSON
  payload and returns the JSON result map (see `SuikouWeb.AgentCLI`).
  Board-changing writes broadcast on the board topic so an open human board
  reflects the change live.
  """

  alias Suikou.Critique
  alias Suikou.Events
  alias Suikou.Export
  alias Suikou.Git
  alias Suikou.Projects
  alias Suikou.Push
  alias Suikou.Reviews
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.ReviewSource.FileSelection
  alias Suikou.Schemas.ReviewSource.GitDiff
  alias Suikou.Settings
  alias Suikou.Submissions
  alias SuikouWeb.AgentCLI
  alias SuikouWeb.Endpoint
  alias SuikouWeb.Stores.BoardBroadcast

  # The longest a single poll call blocks before reporting a timeout, so it
  # returns well within any HTTP-level or client timeout; the CLI re-issues
  # until the submission version changes or its own --timeout elapses.
  # Configurable so the timeout branch is testable without a 25 s wait
  # (`config/test.exs`).
  @default_poll_window_ms 25_000

  @doc """
  Returns reviews as `%{reviews: [...], error}`, filtered either by `"project_id"`
  or by `"path"` — a directory, which answers for the whole repository it belongs
  to, across every worktree and every project those reviews are filed under. That
  is how an agent finds work it did not create from nothing but a checkout.

  ## Examples

      SuikouWeb.AgentCLI.Reviews.list(%{"project_id" => "0192…"})
      #=> %{reviews: [%{id: "0192…", name: "Spec", kind: :file_selection, selections: []}], error: nil}

  """
  @spec list(AgentCLI.payload()) :: AgentCLI.result()
  def list(payload) do
    listed(payload)
  end

  defp listed(%{"path" => path}) when is_binary(path) do
    reviews = path |> Git.toplevel() |> Reviews.list_for_dir() |> Enum.map(&review_summary/1)

    %{reviews: reviews, error: nil}
  end

  defp listed(payload) do
    case Projects.get_project(payload["project_id"]) do
      %Project{} = project ->
        %{reviews: Enum.map(Reviews.list_for_project(project), &review_summary/1), error: nil}

      nil ->
        %{reviews: [], error: "project_not_found"}
    end
  end

  @doc """
  Creates a review and returns `%{review_id, scratch_path}` or `%{error}`,
  broadcasting the board on success. The source is chosen by payload shape:
  `"base_ref"`/`"head_ref"` present builds a git-diff review, otherwise
  `"selections"` builds a file-selection review. A git-diff review takes an
  optional `"stack_ref"`, the review stack to attach (see BDR-0028).

  The project is the one grouping the repository `"project_path"` belongs to, so
  a review created from any worktree lands with its siblings; `"project_id"`
  overrides that lookup. An unknown repository answers `project_not_found`
  rather than registering one, leaving that decision with the human.

  `scratch_path` comes back because creation is the moment the agent needs it:
  it is the directory to write generated output into, addressed afterwards as
  `@scratch/…`.

  ## Examples

      SuikouWeb.AgentCLI.Reviews.create(%{"project_path" => "/projects/app", "name" => "Spec", "selections" => ["docs"]})
      #=> %{review_id: "0192…", scratch_path: "/home/me/.local/share/suikou/app-3f9c2e1a/0192…", error: nil}

  """
  @spec create(AgentCLI.payload()) :: AgentCLI.result()
  def create(payload) do
    with_project(payload, fn project ->
      created_review(create_source(project, payload))
    end)
  end

  defp create_source(project, %{"base_ref" => base, "head_ref" => head} = payload)
       when is_binary(base) and is_binary(head) do
    Reviews.create_diff_review(project, %{
      name: payload["name"],
      project_path: checkout(payload),
      base_ref: base,
      head_ref: head,
      stack_ref: payload["stack_ref"]
    })
  end

  defp create_source(project, payload) do
    Reviews.create_review(project, %{
      name: payload["name"],
      project_path: checkout(payload),
      selections: payload["selections"]
    })
  end

  # The agent sends wherever it is standing; a review pins the repository root so
  # its paths mean the same thing from any subdirectory.
  defp checkout(payload), do: payload |> Map.get("project_path", ".") |> Git.toplevel()

  @doc """
  Returns a review's metadata, current files, and the project's review
  instructions from `%{"review_id"}`, or `%{error}` when unknown.

  An agent that joins an existing review never calls `project list`, so the
  instructions it must follow travel with the review too.

  ## Examples

      SuikouWeb.AgentCLI.Reviews.show(%{"review_id" => "0192…"})
      #=> %{id: "0192…", name: "Spec", kind: :file_selection, instructions: ["Reply in English."], files: [], error: nil}

  """
  @spec show(AgentCLI.payload()) :: AgentCLI.result()
  def show(payload) do
    with_review(payload["review_id"], fn review ->
      Map.merge(review_summary(review), %{
        files: Reviews.list_files(review),
        instructions: Settings.instructions_for(review.project),
        error: nil
      })
    end)
  end

  @doc """
  Returns a review's current files as `%{files}` from `%{"review_id"}`, or
  `%{files: [], error}` when unknown.

  ## Examples

      SuikouWeb.AgentCLI.Reviews.files(%{"review_id" => "0192…"})
      #=> %{files: [%{path: "doc.md", artifact_id: nil}], error: nil}

  """
  @spec files(AgentCLI.payload()) :: AgentCLI.result()
  def files(payload) do
    with_review(
      payload["review_id"],
      fn review -> %{files: Reviews.list_files(review), error: nil} end,
      %{files: [], error: "review_not_found"}
    )
  end

  @doc """
  Returns a review's human-facing URL as `%{url, error}` from `%{"review_id"}`.

  Builds `<endpoint URL>/reviews/<id>` from `Endpoint.url/0`, so it follows the
  configured `:url` host/scheme. The id is the one `create` just returned, so the
  verb only concatenates a path and never hits `Repo`.

  ## Examples

      SuikouWeb.AgentCLI.Reviews.url(%{"review_id" => "0192…"})
      #=> %{url: "https://suikou.example/reviews/0192…", error: nil}

  """
  @spec url(AgentCLI.payload()) :: AgentCLI.result()
  def url(payload) do
    %{url: Endpoint.url() <> "/reviews/" <> payload["review_id"], error: nil}
  end

  @doc """
  Renames a review from `%{"review_id", "name"}` and returns `%{error}`.
  Broadcasts the board on success.

  ## Examples

      SuikouWeb.AgentCLI.Reviews.rename(%{"review_id" => "0192…", "name" => "Spec pass"})
      #=> %{error: nil}

  """
  @spec rename(AgentCLI.payload()) :: AgentCLI.result()
  def rename(payload) do
    mutate(payload["review_id"], &Reviews.rename_review(&1, payload["name"]))
  end

  @doc """
  Replaces a review's file selection from `%{"review_id", "files"}` and returns
  `%{error}`. Broadcasts the board on success.

  ## Examples

      SuikouWeb.AgentCLI.Reviews.set_files(%{"review_id" => "0192…", "files" => ["lib", "readme.md"]})
      #=> %{error: nil}

  """
  @spec set_files(AgentCLI.payload()) :: AgentCLI.result()
  def set_files(payload) do
    mutate(payload["review_id"], &Reviews.set_selection(&1, payload["files"]))
  end

  @doc """
  Attaches a review stack to a git-diff review from `%{"review_id",
  "stack_ref"}` and returns `%{error}`. Broadcasts the board on success. A stack
  whose tip tree differs from the source's is rejected with the differing
  paths (see BDR-0028).

  ## Examples

      SuikouWeb.AgentCLI.Reviews.set_stack(%{"review_id" => "0192…", "stack_ref" => "topic-review"})
      #=> %{error: nil}

      SuikouWeb.AgentCLI.Reviews.set_stack(%{"review_id" => "0192…", "stack_ref" => "topic-partial"})
      #=> %{error: "stack_not_equivalent: lib/app.ex"}

  """
  @spec set_stack(AgentCLI.payload()) :: AgentCLI.result()
  def set_stack(payload) do
    mutate(payload["review_id"], &Reviews.set_stack(&1, payload["stack_ref"]))
  end

  @doc """
  Adds paths to a review's file selection from `%{"review_id", "files"}` (union,
  incremental — the caller sends only the paths to add) and returns `%{error}`.
  Broadcasts the board on success.

  ## Examples

      SuikouWeb.AgentCLI.Reviews.add_files(%{"review_id" => "0192…", "files" => ["lib/new.ex"]})
      #=> %{error: nil}

  """
  @spec add_files(AgentCLI.payload()) :: AgentCLI.result()
  def add_files(payload) do
    mutate(payload["review_id"], &Reviews.add_files(&1, payload["files"]))
  end

  @doc """
  Removes paths from a review's file selection from `%{"review_id", "files"}`
  (incremental — the caller sends only the paths to remove) and returns
  `%{error}`. Broadcasts the board on success.

  ## Examples

      SuikouWeb.AgentCLI.Reviews.remove_files(%{"review_id" => "0192…", "files" => ["lib/old.ex"]})
      #=> %{error: nil}

  """
  @spec remove_files(AgentCLI.payload()) :: AgentCLI.result()
  def remove_files(payload) do
    mutate(payload["review_id"], &Reviews.remove_files(&1, payload["files"]))
  end

  @doc """
  Deletes a review from `%{"review_id"}` and returns `%{error}`. Broadcasts the
  board on success.

  ## Examples

      SuikouWeb.AgentCLI.Reviews.delete(%{"review_id" => "0192…"})
      #=> %{error: nil}

  """
  @spec delete(AgentCLI.payload()) :: AgentCLI.result()
  def delete(payload) do
    mutate(payload["review_id"], &Reviews.delete_review/1)
  end

  @doc """
  Returns a one-shot critique snapshot for `%{"review_id"}` scoped by the optional
  `"rounds"` key (see `scope/1`), or `%{error}` when the review is unknown.

  ## Examples

      SuikouWeb.AgentCLI.Reviews.export(%{"review_id" => "0192…", "rounds" => [1, 3]})
      #=> %{review_id: "0192…", submission_version: 2, artifacts: []}

  """
  @spec export(AgentCLI.payload()) :: AgentCLI.result()
  def export(payload) do
    payload["review_id"] |> snapshot(scope(payload)) |> drop_resolved_round()
  end

  @doc """
  Waits on `%{"review_id"}` for a submission round. An optional `"until_round"`
  names the round the agent wants to see; when that round has already been
  submitted at call time (`submission count >= until_round`) the snapshot returns
  at once — otherwise the call blocks until it lands. Absent `"until_round"`, it
  waits for the *next* submission past the current count (the prior behavior).
  Agents should pass the round they expect (last processed round + 1) so a round
  that landed between calls returns immediately instead of blocking for the one
  after it.

  Subscribes to the review's `Suikou.Events` change topic, then blocks up to the
  poll window (~25 s, or the smaller `"timeout_ms"` budget when supplied). On a
  wake that reaches the target round it returns the `export_review` snapshot for the
  requested rounds scope; `submission_version` carries the latest round number. A
  wake that only changed reactions (add, remove, or emoji swap) returns the full
  snapshot for the scope with the unchanged `submission_version`, so the agent
  sees the new reaction even on a comment it had already addressed. Otherwise it
  returns `%{status: "timeout", submission_version}` carrying the current round
  count. The default latest-round snapshot on a submission wake is filtered to
  comments still owed a move (drops resolved and already-answered comments); an
  explicit `"rounds"` scope is returned in full. Returns
  `%{error: "review_not_found"}` when the review is unknown.

  ## Examples

      SuikouWeb.AgentCLI.Reviews.wait(%{"review_id" => "0192…", "until_round" => 2})
      #=> %{status: "timeout", submission_version: 1}  # or the snapshot on a wake

  """
  @spec wait(AgentCLI.payload()) :: AgentCLI.result()
  def wait(payload) do
    review_id = payload["review_id"]
    scope = scope(payload)

    reply =
      with_review(review_id, fn _review ->
        Events.subscribe(review_id)
        count = Submissions.review_submission_count(review_id)
        reaction_version = Critique.review_reaction_version(review_id)
        threshold = wait_threshold(payload, count)

        if count > threshold do
          worthy_snapshot(review_id, scope)
        else
          deadline = System.monotonic_time(:millisecond) + poll_window_ms(payload)
          # Register waiter presence for the footer indicator only while blocked.
          # A hard kill mid-wait skips the `after` unregister, but the Registry
          # auto-drops the dead pid and the next poll's register rebroadcasts.
          Events.register_waiting(review_id)

          try do
            await(review_id, scope, threshold, reaction_version, deadline)
          after
            Events.unregister_waiting(review_id)
          end
        end
      end)

    drop_resolved_round(reply)
  end

  # The optional `"until_round"` names the submission round the agent is waiting to
  # see. The wait wakes once the review's submission count reaches it, so the
  # threshold is the round *below* it: `count > threshold` means that round
  # already landed and the call returns the snapshot at once (no block). Absent,
  # the threshold is the current count, so the wait blocks for the next
  # submission — the prior behavior.
  defp wait_threshold(payload, current_count) do
    case payload["until_round"] do
      round when is_integer(round) and round > 0 -> round - 1
      _absent -> current_count
    end
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
  # count returns the working-set snapshot; a wake that only changed reactions
  # returns the full snapshot (unfiltered, so a reaction on an already-addressed
  # comment is still visible); any other wake keeps waiting within the remaining
  # time; an exhausted window reports a timeout.
  defp await(review_id, scope, threshold, reaction_version, deadline) do
    timeout = max(deadline - System.monotonic_time(:millisecond), 0)

    receive do
      {:review_changed, _review_id, _artifact_id} ->
        cond do
          Submissions.review_submission_count(review_id) > threshold ->
            worthy_snapshot(review_id, scope)

          Critique.review_reaction_version(review_id) != reaction_version ->
            snapshot(review_id, scope)

          true ->
            await(review_id, scope, threshold, reaction_version, deadline)
        end
    after
      timeout ->
        %{status: "timeout", submission_version: Submissions.review_submission_count(review_id)}
    end
  end

  # A poll wake delivers the working set, not the whole record: the default
  # latest-round snapshot is filtered to comments an agent still owes a move on,
  # dropping resolved ones and any whose discussion an agent already answered
  # (a single comment row stays visible across rounds until resolved — see
  # `Suikou.Export`). An explicit rounds scope is a history request, so it passes
  # through unfiltered; so does `export`, which mirrors the human export.
  defp worthy_snapshot(review_id, :latest) do
    case snapshot(review_id, :latest) do
      %{artifacts: artifacts} = export ->
        %{export | artifacts: Enum.map(artifacts, &drop_addressed/1)}

      other ->
        other
    end
  end

  defp worthy_snapshot(review_id, scope), do: snapshot(review_id, scope)

  defp drop_addressed(%{comments: comments} = artifact) do
    %{artifact | comments: Enum.reject(comments, &addressed?/1)}
  end

  # A comment is addressed when it is resolved (carries a resolution round) or an
  # agent has the last published word in its thread — the most recent reply is an
  # agent's, so nothing is owed until the human speaks again. The wait blocks on
  # the human submitting a round, not on any one agent's turn, so this asks
  # whether *an* agent answered rather than which one.
  defp addressed?(comment) do
    match?(%{author: %{kind: :agent}}, List.last(comment.replies)) or
      not is_nil(comment.resolved_round)
  end

  # `resolved_round` drives the latest-round working-set filter (`addressed?`), so
  # it lives on the Export view but is stripped from the emitted JSON — the agent
  # acts on the comment, not on resolution bookkeeping. Stripped after the filter
  # has run, never before.
  defp drop_resolved_round(%{artifacts: artifacts} = export) do
    %{export | artifacts: Enum.map(artifacts, &drop_comment_rounds/1)}
  end

  defp drop_resolved_round(other), do: other

  defp drop_comment_rounds(%{comments: comments} = artifact) do
    %{artifact | comments: Enum.map(comments, &Map.delete(&1, :resolved_round))}
  end

  @doc """
  Pushes a Web Push notification for `%{"review_id"}` to every subscribed browser
  and returns `%{delivered, error}` — the count the push services accepted. The
  notification's title is the review name, its body the optional `"message"` (a
  generic prompt when absent), and clicking it opens the review. Returns
  `%{error: "review_not_found"}` when the review is unknown.

  ## Examples

      SuikouWeb.AgentCLI.Reviews.notify(%{"review_id" => "0192…", "message" => "Addressed round 2"})
      #=> %{delivered: 1, error: nil}

  """
  @spec notify(AgentCLI.payload()) :: AgentCLI.result()
  def notify(payload) do
    with_review(payload["review_id"], fn review ->
      {:ok, delivered} =
        Push.notify(%{
          title: review.name,
          body: notify_body(payload["message"]),
          url: Endpoint.url() <> "/reviews/" <> review.id
        })

      %{delivered: delivered, error: nil}
    end)
  end

  defp notify_body(message) when is_binary(message) and message != "", do: message
  defp notify_body(_absent), do: "Ready for review"

  # An explicit project wins; otherwise the repository the working directory
  # belongs to decides, which is what puts sibling worktrees in one project.
  defp with_project(payload, fun) do
    case resolve_project(payload) do
      {:ok, %Project{} = project} -> fun.(project)
      {:error, reason} -> create_reply(nil, AgentCLI.error(reason))
    end
  end

  defp resolve_project(%{"project_id" => project_id}) when is_binary(project_id) do
    case Projects.get_project(project_id) do
      %Project{} = project -> {:ok, project}
      nil -> {:error, :project_not_found}
    end
  end

  defp resolve_project(%{"project_path" => path}) when is_binary(path) do
    Projects.project_for_dir(Git.toplevel(path))
  end

  defp resolve_project(_payload), do: {:error, :project_not_found}

  defp created_review({:ok, %Review{} = review}) do
    BoardBroadcast.broadcast()
    create_reply(review, nil)
  end

  defp created_review({:error, reason}), do: create_reply(nil, AgentCLI.error(reason))

  # One shape for every `create` outcome, so a caller never has to branch on
  # which keys are present.
  defp create_reply(nil, error), do: %{review_id: nil, scratch_path: nil, error: error}

  defp create_reply(%Review{} = review, error),
    do: %{review_id: review.id, scratch_path: review.scratch_path, error: error}

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

    %{
      id: review.id,
      name: review.name,
      kind: kind,
      selections: selections,
      stack_ref: stack_ref(review),
      project_id: review.project_id,
      project_path: review.project_path,
      scratch_path: review.scratch_path
    }
  end

  defp kind_and_selections(%Review{source: %FileSelection{selection_paths: paths}}) do
    {:file_selection, paths}
  end

  defp kind_and_selections(%Review{source: %GitDiff{}}), do: {:git_diff, []}

  defp stack_ref(%Review{source: %GitDiff{stack_ref: stack_ref}}), do: stack_ref
  defp stack_ref(%Review{}), do: nil
end

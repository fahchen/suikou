defmodule SuikouWeb.Stores.ProjectBoardStore do
  @moduledoc """
  Root store backing the project board: the reviewer's entry point.

  Takes no mount params. Renders every registered project with its candidate
  markdown files (for building a selection) and its reviews. A review is a named
  set of selected files, each backed by an artifact (see BDR-0018); the
  `create_review` command mints one from a project and a list of file paths and
  replies with the new review id, while `update_review_files` reconciles a
  review's selection. The `create_project` command registers a directory.
  """

  use Musubi.Store, root: true

  alias Musubi.AsyncResult
  alias Musubi.Socket
  alias Suikou.Git
  alias Suikou.Projects
  alias Suikou.Reviews
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.ReviewSource.FileSelection
  alias Suikou.Schemas.ReviewSource.GitDiff
  alias SuikouWeb.Iso8601
  alias SuikouWeb.Stores.BoardBroadcast
  alias SuikouWeb.Stores.ProjectBoardContract
  require ProjectBoardContract

  state do
    field(
      :projects,
      list(%{
        id: String.t(),
        name: String.t(),
        path: String.t(),
        reviews:
          list(%{
            id: String.t(),
            name: String.t(),
            inserted_at: String.t(),
            kind: :file_selection | :git_diff,
            selections: list(String.t()),
            base_ref: String.t() | nil,
            head_ref: String.t() | nil,
            base_sha: String.t() | nil,
            head_sha: String.t() | nil,
            creation_base_sha: String.t() | nil,
            creation_head_sha: String.t() | nil,
            refs_moved: boolean()
          })
      })
    )

    # Async map of `review_id => expanded file list`, derived from
    # `Reviews.list_files/1`. Carries the authoritative file count for every
    # card — including git-diff reviews, whose card was previously stuck at 0
    # and unopenable.
    ProjectBoardContract.review_files_state_field()
  end

  command :create_project do
    payload do
      field(:name, String.t())
      field(:path, String.t())
    end

    reply do
      field(:project_id, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  command :create_review do
    payload do
      field(:project_id, String.t())
      field(:name, String.t())
      field(:selections, list(String.t()))
    end

    reply do
      field(:review_id, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  command :create_diff_review do
    payload do
      field(:project_id, String.t())
      field(:name, String.t())
      field(:base_ref, String.t() | nil)
      field(:head_ref, String.t())
    end

    reply do
      field(:review_id, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  command :list_branches do
    payload do
      field(:project_id, String.t())
    end

    reply do
      field(:branches, list(String.t()))
      field(:remote_branches, list(String.t()))
      field(:default, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  command :update_review_files do
    payload do
      field(:review_id, String.t())
      field(:selections, list(String.t()))
    end

    reply do
      field(:error, String.t() | nil)
    end
  end

  command :rename_review do
    payload do
      field(:review_id, String.t())
      field(:name, String.t())
    end

    reply do
      field(:error, String.t() | nil)
    end
  end

  command :delete_review do
    payload do
      field(:review_id, String.t())
    end

    reply do
      field(:error, String.t() | nil)
    end
  end

  command :delete_project do
    payload do
      field(:project_id, String.t())
    end

    reply do
      field(:error, String.t() | nil)
    end
  end

  command :list_dir do
    payload do
      field(:project_id, String.t())
      field(:path, String.t())
    end

    reply do
      field(:entries, list(%{path: String.t(), dir: boolean()}))
    end
  end

  command :list_review_files do
    payload do
      field(:review_id, String.t())
    end

    reply do
      ProjectBoardContract.review_files_reply_field()

      field(:error, String.t() | nil)
    end
  end

  command :open_review_file do
    payload do
      field(:review_id, String.t())
      field(:path, String.t())
    end

    reply do
      field(:artifact_id, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  @impl Musubi.Store
  @spec mount(map(), Socket.t()) :: {:ok, Socket.t()}
  def mount(_params, socket) do
    BoardBroadcast.subscribe()
    {:ok, refresh_review_files(socket)}
  end

  # A board write on another connection (e.g. a CLI `review create`) does not
  # dirty this open board, so it would push no patch. Recompute the review
  # list and dirty an assign so the next render reflects the change live. As a
  # root store with no children there is no `send_update` fan-out.
  @impl Musubi.Store
  @spec handle_info(BoardBroadcast.message(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_info(:board_changed, socket) do
    {:noreply, socket |> refresh_review_files() |> touch()}
  end

  @impl Musubi.Store
  @spec render(Socket.t()) :: map()
  def render(socket) do
    %{
      projects: Enum.map(Projects.list_projects(), &render_project/1),
      review_files: Map.get(socket.assigns, :review_files, AsyncResult.loading())
    }
  end

  @impl Musubi.Store
  @spec handle_command(atom(), map(), Socket.t()) :: {:reply, map(), Socket.t()}
  def handle_command(:create_project, payload, socket) do
    case Projects.register_project(%{name: payload["name"], path: payload["path"]}) do
      {:ok, %Project{} = project} ->
        {:reply, %{project_id: project.id, error: nil}, touch(socket)}

      {:error, reason} ->
        {:reply, %{project_id: nil, error: project_error(reason)}, socket}
    end
  end

  def handle_command(:create_review, payload, socket) do
    {reply, socket} =
      case Projects.get_project(payload["project_id"]) do
        %Project{} = project ->
          case create_review(project, payload) do
            {reply, %Review{id: id}} -> {reply, upsert_review_files(socket, id)}
            {reply, nil} -> {reply, socket}
          end

        nil ->
          {%{review_id: nil, error: "project_not_found"}, socket}
      end

    {:reply, reply, touch(socket)}
  end

  def handle_command(:create_diff_review, payload, socket) do
    {reply, socket} =
      case Projects.get_project(payload["project_id"]) do
        %Project{} = project ->
          case create_diff_review(project, payload) do
            {reply, %Review{id: id}} -> {reply, upsert_review_files(socket, id)}
            {reply, nil} -> {reply, socket}
          end

        nil ->
          {%{review_id: nil, error: "project_not_found"}, socket}
      end

    {:reply, reply, touch(socket)}
  end

  def handle_command(:list_branches, payload, socket) do
    reply =
      case Projects.get_project(payload["project_id"]) do
        %Project{} = project -> list_branches(project)
        nil -> branches_reply([], [], nil, "project_not_found")
      end

    {:reply, reply, socket}
  end

  def handle_command(:update_review_files, payload, socket) do
    review_id = payload["review_id"]

    {reply, socket} =
      case Reviews.get_review(review_id) do
        %Review{} = review ->
          {update_review_files(review, payload["selections"]),
           upsert_review_files(socket, review_id)}

        nil ->
          {%{error: "review_not_found"}, socket}
      end

    {:reply, reply, touch(socket)}
  end

  def handle_command(:rename_review, payload, socket) do
    reply =
      case Reviews.get_review(payload["review_id"]) do
        %Review{} = review -> rename_review(review, payload["name"])
        nil -> %{error: "review_not_found"}
      end

    {:reply, reply, touch(socket)}
  end

  def handle_command(:delete_review, payload, socket) do
    review_id = payload["review_id"]

    {reply, socket} =
      case Reviews.get_review(review_id) do
        %Review{} = review ->
          {delete_review(review), remove_review_files(socket, review_id)}

        nil ->
          {%{error: "review_not_found"}, socket}
      end

    {:reply, reply, touch(socket)}
  end

  def handle_command(:delete_project, payload, socket) do
    reply =
      case Projects.delete_project(payload["project_id"]) do
        {:ok, %Project{}} -> %{error: nil}
        {:error, reason} -> %{error: project_error(reason)}
      end

    {:reply, reply, touch(socket)}
  end

  # On-demand directory scan: one level at a time, kept off render so neither the
  # board's first snapshot nor opening the picker blocks on walking a whole
  # working directory (see docs/musubi-issues.md).
  def handle_command(:list_dir, payload, socket) do
    entries =
      case Projects.get_project(payload["project_id"]) do
        %Project{} = project -> Projects.list_dir(project, payload["path"])
        nil -> []
      end

    {:reply, %{entries: entries}, socket}
  end

  # Expands a review's selection against disk on demand (only when its files are
  # revealed), so the board's render never walks a working directory.
  def handle_command(:list_review_files, payload, socket) do
    reply =
      case Reviews.get_review(payload["review_id"]) do
        %Review{} = review -> %{files: Reviews.list_files(review), error: nil}
        nil -> %{files: [], error: "review_not_found"}
      end

    {:reply, reply, socket}
  end

  def handle_command(:open_review_file, payload, socket) do
    review_id = payload["review_id"]

    {reply, socket} =
      case Reviews.get_review(review_id) do
        %Review{} = review ->
          {open_review_file(review, payload["path"]), upsert_review_files(socket, review_id)}

        nil ->
          {%{artifact_id: nil, error: "review_not_found"}, socket}
      end

    {:reply, reply, touch(socket)}
  end

  # The render derives entirely from the database; a mutation that does not touch
  # assigns would reuse the cached render and push no patch (see
  # docs/musubi-issues.md ISSUE-1). Bump a render-irrelevant assign so another
  # client viewing the board sees the change.
  defp touch(socket), do: Socket.assign(socket, :rev, System.unique_integer())

  defp create_review(project, payload) do
    params = %{name: payload["name"], selections: payload["selections"]}

    case Reviews.create_review(project, params) do
      {:ok, %Review{} = review} -> {%{review_id: review.id, error: nil}, review}
      {:error, reason} -> {%{review_id: nil, error: review_error(reason)}, nil}
    end
  end

  defp create_diff_review(project, payload) do
    params = %{
      name: payload["name"],
      base_ref: payload["base_ref"],
      head_ref: payload["head_ref"]
    }

    case Reviews.create_diff_review(project, params) do
      {:ok, %Review{} = review} -> {%{review_id: review.id, error: nil}, review}
      {:error, reason} -> {%{review_id: nil, error: review_error(reason)}, nil}
    end
  end

  defp list_branches(project) do
    case Reviews.list_branches(project) do
      {:ok, %{branches: branches, remote_branches: remote, default: default}} ->
        branches_reply(branches, remote, default, nil)

      {:error, reason} ->
        branches_reply([], [], nil, review_error(reason))
    end
  end

  defp branches_reply(branches, remote_branches, default, error) do
    %{branches: branches, remote_branches: remote_branches, default: default, error: error}
  end

  defp update_review_files(review, selections) do
    {:ok, %Review{}} = Reviews.set_selection(review, selections)
    %{error: nil}
  end

  defp open_review_file(review, path) do
    case Reviews.open_file(review, path) do
      {:ok, artifact} -> %{artifact_id: artifact.id, error: nil}
      {:error, reason} -> %{artifact_id: nil, error: review_error(reason)}
    end
  end

  defp rename_review(review, name) do
    case Reviews.rename_review(review, name) do
      {:ok, %Review{}} -> %{error: nil}
      {:error, reason} -> %{error: review_error(reason)}
    end
  end

  defp delete_review(review) do
    case Reviews.delete_review(review) do
      {:ok, %Review{}} -> %{error: nil}
      {:error, reason} -> %{error: review_error(reason)}
    end
  end

  defp project_error(reason) when is_atom(reason), do: Atom.to_string(reason)

  defp project_error(%Ecto.Changeset{errors: errors}) do
    Enum.map_join(errors, ", ", fn {field, {message, _opts}} -> "#{field} #{message}" end)
  end

  defp review_error(reason) when is_atom(reason), do: Atom.to_string(reason)

  defp review_error(%Ecto.Changeset{errors: errors}) do
    Enum.map_join(errors, ", ", fn {field, {message, _opts}} -> "#{field} #{message}" end)
  end

  defp render_project(%Project{} = project) do
    %{
      id: project.id,
      name: project.name,
      path: project.path,
      reviews: Enum.map(Reviews.list_for_project(project), &render_review/1)
    }
  end

  defp render_review(%Review{source: %FileSelection{selection_paths: paths}} = review) do
    %{
      id: review.id,
      name: review.name,
      inserted_at: Iso8601.utc(review.inserted_at),
      kind: :file_selection,
      selections: paths,
      base_ref: nil,
      head_ref: nil,
      base_sha: nil,
      head_sha: nil,
      creation_base_sha: nil,
      creation_head_sha: nil,
      refs_moved: false
    }
  end

  # A git-diff review's reviewer-facing "selection" is the diff between two
  # refs, not a path list. The card surfaces its file count + list through the
  # async `review_files` field; `selections` stays empty. `base_ref`/`head_ref`
  # let the card display the compared refs (e.g. `main..topic`) independently
  # of the review's chosen name. `base_sha`/`head_sha` are the refs' CURRENT
  # commit SHAs (40-char hex) so the reviewer can tell which commits the diff
  # actually reflects right now; both are `nil` when the ref no longer
  # resolves (deleted branch, detached state). `creation_base_sha` /
  # `creation_head_sha` are the SHAs pinned when the review was created (or
  # backfilled from the then-current SHA for legacy rows), and `refs_moved`
  # is true iff at least one side's current SHA differs from its creation
  # SHA. A vanished current SHA does not flag a move (`refs_moved: false` on
  # the unknown side), so the reviewer is not warned about a phantom move
  # just because a branch was deleted.
  defp render_review(%Review{source: %GitDiff{} = git_diff, project: project} = review) do
    current_base = resolve_sha(project, git_diff.base_ref)
    current_head = resolve_sha(project, git_diff.head_ref)

    %{
      id: review.id,
      name: review.name,
      inserted_at: Iso8601.utc(review.inserted_at),
      kind: :git_diff,
      selections: [],
      base_ref: git_diff.base_ref,
      head_ref: git_diff.head_ref,
      base_sha: current_base,
      head_sha: current_head,
      creation_base_sha: git_diff.base_sha,
      creation_head_sha: git_diff.head_sha,
      refs_moved:
        side_moved?(git_diff.base_sha, current_base) or
          side_moved?(git_diff.head_sha, current_head)
    }
  end

  defp resolve_sha(%Project{path: path}, ref) do
    case Git.rev_parse(path, ref) do
      {:ok, sha} -> sha
      {:error, _reason} -> nil
    end
  end

  defp side_moved?(creation_sha, current_sha)
       when is_binary(creation_sha) and is_binary(current_sha),
       do: creation_sha != current_sha

  defp side_moved?(_creation_sha, _current_sha), do: false

  # Walks every project's reviews on first mount, populating the async
  # `review_files` field off-render so the board's first snapshot does not
  # block on disk or git. Subsequent mutations patch a single review's entry
  # in place (`upsert_review_files/2` / `remove_review_files/2`), so the
  # board's hot path no longer rebuilds the full index per mutation.
  defp refresh_review_files(socket) do
    assign_async(
      socket,
      :review_files,
      fn -> {:ok, compute_review_files()} end,
      reset: true
    )
  end

  defp compute_review_files do
    for project <- Projects.list_projects(),
        review <- Reviews.list_for_project(project) do
      %{review_id: review.id, files: Reviews.list_files(review)}
    end
  end

  # Recomputes a single review's `:files` entry and merges it into the async
  # list off-render. Runs through `assign_async/3` so the prior mount task
  # (if still in flight) is cancelled before our patch lands — no stale
  # overwrite race. If the prior snapshot is empty (mount async was cancelled
  # before resolving), we fall back to a full compute so unrelated reviews
  # still appear; otherwise we patch one entry in place.
  defp upsert_review_files(socket, review_id) do
    patch_review_files(socket, fn prior ->
      case Reviews.get_review(review_id) do
        %Review{} = review ->
          entry = %{review_id: review.id, files: Reviews.list_files(review)}
          merge_or_full_compute(prior, entry)

        nil ->
          Enum.reject(prior, &(&1.review_id == review_id))
      end
    end)
  end

  defp remove_review_files(socket, review_id) do
    patch_review_files(socket, fn prior ->
      Enum.reject(prior, &(&1.review_id == review_id))
    end)
  end

  defp patch_review_files(socket, fun) when is_function(fun, 1) do
    prior = current_review_files(socket)
    assign_async(socket, :review_files, fn -> {:ok, fun.(prior)} end)
  end

  defp current_review_files(socket) do
    case Map.get(socket.assigns, :review_files) do
      %AsyncResult{result: list} when is_list(list) -> list
      _other -> []
    end
  end

  defp merge_or_full_compute([], entry), do: upsert_entry(compute_review_files(), entry)
  defp merge_or_full_compute(prior, entry), do: upsert_entry(prior, entry)

  defp upsert_entry(entries, %{review_id: id} = entry) do
    case Enum.find_index(entries, &(&1.review_id == id)) do
      nil -> [entry | entries]
      index -> List.replace_at(entries, index, entry)
    end
  end
end

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
  alias Suikou.Projects
  alias Suikou.ReviewRoots
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
    ProjectBoardContract.projects_field()

    # Async map of `review_id => expanded file list`, derived from
    # `Reviews.list_files/1`. Carries the authoritative file count for every
    # card — including git-diff reviews, whose card was previously stuck at 0
    # and unopenable.
    ProjectBoardContract.review_files_state_field()
  end

  # Request-response load of the whole board: chrome + review list + per-review
  # file rows. The client renders from this reply's state instead of subscribing
  # to the live snapshot, so a hard WebSocket disconnect leaves the board (and its
  # navigation) intact; it refetches on mount, on socket reconnect, and after each
  # mutation succeeds.
  command :load_board do
    reply do
      ProjectBoardContract.projects_field()
      ProjectBoardContract.review_files_grouped_field()

      # Every checkout any review already reads from, most recently used first,
      # so the review-creation dialog can complete a directory instead of asking
      # the human to retype one they have used before.
      field(:checkouts, list(String.t()))
    end
  end

  command :create_project do
    payload do
      field(:name, String.t())
      field(:respect_gitignore, boolean())
      field(:emoji, String.t() | nil)
    end

    reply do
      field(:project_id, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  command :update_project do
    payload do
      field(:project_id, String.t())
      field(:name, String.t())
      field(:respect_gitignore, boolean())
      field(:emoji, String.t() | nil)
      field(:review_instructions, String.t() | nil)
    end

    reply do
      field(:error, String.t() | nil)
    end
  end

  command :create_review do
    payload do
      field(:project_id, String.t())
      field(:name, String.t())
      field(:root, String.t() | nil)
      field(:respect_gitignore, boolean() | nil)
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
      field(:root, String.t() | nil)
      field(:respect_gitignore, boolean() | nil)
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
      field(:root, String.t() | nil)
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

  command :move_review do
    payload do
      field(:review_id, String.t())
      field(:project_id, String.t())
    end

    reply do
      field(:error, String.t() | nil)
    end
  end

  command :set_review_gitignore do
    payload do
      field(:review_id, String.t())
      field(:respect_gitignore, boolean() | nil)
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
      field(:root, String.t() | nil)
      field(:respect_gitignore, boolean())
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
    socket = Socket.assign(socket, :review_files, AsyncResult.loading())
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

  # The async review-files loaders (mount, board broadcast, per-review patch) all
  # return the full list and resolve here, so the field swaps in place at `:ok`
  # without ever flipping back to `:loading` — no card flicker on refresh.
  @impl Musubi.Store
  @spec handle_async(:review_files, {:ok, [map()]} | {:exit, term()}, Socket.t()) ::
          {:noreply, Socket.t()}
  def handle_async(:review_files, {:ok, list}, socket) do
    prior = Map.get(socket.assigns, :review_files, AsyncResult.loading())
    {:noreply, Socket.assign(socket, :review_files, AsyncResult.ok(prior, list))}
  end

  def handle_async(:review_files, {:exit, reason}, socket) do
    prior = Map.get(socket.assigns, :review_files, AsyncResult.loading())
    {:noreply, Socket.assign(socket, :review_files, AsyncResult.failed(prior, {:exit, reason}))}
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
  def handle_command(:load_board, _payload, socket) do
    reply = %{
      projects: Enum.map(Projects.list_projects(), &render_project/1),
      review_files: compute_review_files(),
      checkouts: Reviews.list_checkouts()
    }

    {:reply, reply, socket}
  end

  # No directory: a project is a label, and its repository identity is claimed
  # from the first review filed under it (see `Suikou.Projects.get_project_by_dir/1`).
  def handle_command(:create_project, payload, socket) do
    params = %{
      name: payload["name"],
      respect_gitignore: payload["respect_gitignore"],
      emoji: payload["emoji"]
    }

    case Projects.register_project(params) do
      {:ok, %Project{} = project} ->
        {:reply, %{project_id: project.id, error: nil}, touch(socket)}

      {:error, reason} ->
        {:reply, %{project_id: nil, error: project_error(reason)}, socket}
    end
  end

  def handle_command(:update_project, payload, socket) do
    reply =
      case Projects.get_project(payload["project_id"]) do
        %Project{} = project ->
          params =
            Map.take(payload, ["name", "respect_gitignore", "emoji", "review_instructions"])

          case Projects.update_project(project, params) do
            {:ok, %Project{}} -> %{error: nil}
            {:error, reason} -> %{error: project_error(reason)}
          end

        nil ->
          %{error: "project_not_found"}
      end

    {:reply, reply, touch(socket)}
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
        %Project{} -> list_branches(payload["root"])
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

  def handle_command(:move_review, payload, socket) do
    reply = move_review(payload["review_id"], payload["project_id"])

    {:reply, reply, touch(socket)}
  end

  def handle_command(:set_review_gitignore, payload, socket) do
    reply =
      case Reviews.get_review(payload["review_id"]) do
        %Review{} = review ->
          {:ok, %Review{}} =
            Reviews.set_respect_gitignore(review, payload["respect_gitignore"])

          %{error: nil}

        nil ->
          %{error: "review_not_found"}
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
        %Project{} ->
          list_dir(payload["root"], payload["respect_gitignore"], payload["path"])

        nil ->
          []
      end

    {:reply, %{entries: entries}, socket}
  end

  # Expands a review's selection against disk on demand (only when its files are
  # revealed), so the board's render never walks a working directory.
  def handle_command(:list_review_files, payload, socket) do
    reply =
      case Reviews.get_review(payload["review_id"]) do
        %Review{} = review ->
          %{files: Enum.reject(Reviews.list_files(review), & &1.soft_removed), error: nil}

        nil ->
          %{files: [], error: "review_not_found"}
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
  # assigns would reuse the cached render and push no patch. Bump a
  # render-irrelevant assign so another client viewing the board sees the change.
  defp touch(socket), do: Socket.assign(socket, :rev, System.unique_integer())

  defp create_review(project, payload) do
    created(checkout(payload["root"]), fn path ->
      Reviews.create_review(project, %{
        name: payload["name"],
        project_path: path,
        respect_gitignore: payload["respect_gitignore"],
        selections: payload["selections"]
      })
    end)
  end

  defp create_diff_review(project, payload) do
    created(checkout(payload["root"]), fn path ->
      Reviews.create_diff_review(project, %{
        name: payload["name"],
        project_path: path,
        respect_gitignore: payload["respect_gitignore"],
        base_ref: payload["base_ref"],
        head_ref: payload["head_ref"]
      })
    end)
  end

  # A review reads from a checkout, so refuse rather than inventing one — the
  # server's own working directory is not what the human meant.
  defp created(nil, _create), do: {%{review_id: nil, error: "no_checkout"}, nil}

  defp created(path, create) do
    case create.(path) do
      {:ok, %Review{} = review} -> {%{review_id: review.id, error: nil}, review}
      {:error, reason} -> {%{review_id: nil, error: review_error(reason)}, nil}
    end
  end

  # A project is a label with no directory of its own, so the checkout comes from
  # the dialog, which prefills it with whatever the project's most recent review
  # used. A project with no reviews yet has nothing to prefill, so the human
  # names a directory once and every later review inherits it.
  # Canonicalised, not resolved to a repository root: a human typing a path means
  # that directory, and a subtree is a legitimate thing to review. Only the
  # symlink spelling is normalised, so a checkout typed here and one sent from a
  # shell agree instead of reading as `/tmp/x` and `/private/tmp/x`. `nil` when
  # the dialog has none to offer, which is a project whose first review this is.
  defp checkout(root) when is_binary(root) do
    trimmed = String.trim(root)

    if trimmed == "", do: nil, else: ReviewRoots.canonical(trimmed)
  end

  defp checkout(_absent), do: nil

  # The dialog's own gitignore choice drives the preview, so the tree a human
  # picks from is the tree the review will list.
  defp list_dir(root, respect, rel) do
    case checkout(root) do
      nil -> []
      path -> Projects.list_dir(path, respect, rel)
    end
  end

  defp list_branches(root) do
    case list_branches_at(checkout(root)) do
      {:ok, %{branches: branches, remote_branches: remote, default: default}} ->
        branches_reply(branches, remote, default, nil)

      {:error, reason} ->
        branches_reply([], [], nil, review_error(reason))
    end
  end

  defp list_branches_at(nil), do: {:error, :not_a_git_repo}
  defp list_branches_at(path), do: Reviews.list_branches(path)

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

  defp move_review(review_id, project_id) do
    with %Review{} = review <- Reviews.get_review(review_id),
         %Project{} = project <- Projects.get_project(project_id) do
      {:ok, %Review{}} = Reviews.move_review(review, project)
      %{error: nil}
    else
      nil -> %{error: "not_found"}
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
      path: Reviews.latest_project_path(project),
      respect_gitignore: project.respect_gitignore,
      emoji: project.emoji,
      review_instructions: project.review_instructions,
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
      project_path: review.project_path,
      scratch_path: review.scratch_path,
      respect_gitignore: review.respect_gitignore,
      base_ref: nil,
      head_ref: nil,
      refs_valid: false
    }
  end

  # A git-diff review's reviewer-facing "selection" is the diff between two
  # refs, not a path list. The card surfaces its file count + list through the
  # async `review_files` field; `selections` stays empty. `base_ref`/`head_ref`
  # let the card display the compared refs (e.g. `main..topic`) independently
  # of the review's chosen name. `refs_valid` is `false` when either side no
  # longer resolves in the project's git tree, so the workspace can surface a
  # branch-deleted error page instead of a stale snapshot (BDR-0025).
  defp render_review(%Review{source: %GitDiff{}} = review) do
    refs = Reviews.refs_snapshot(review)

    %{
      id: review.id,
      name: review.name,
      inserted_at: Iso8601.utc(review.inserted_at),
      kind: :git_diff,
      selections: [],
      project_path: review.project_path,
      scratch_path: review.scratch_path,
      respect_gitignore: review.respect_gitignore,
      base_ref: refs.base_ref,
      head_ref: refs.head_ref,
      refs_valid: refs.refs_valid
    }
  end

  # Walks every project's reviews on first mount, populating the async
  # `review_files` field off-render so the board's first snapshot does not
  # block on disk or git. Subsequent mutations patch a single review's entry
  # in place (`upsert_review_files/2` / `remove_review_files/2`), so the
  # board's hot path no longer rebuilds the full index per mutation.
  defp refresh_review_files(socket) do
    start_async(socket, :review_files, fn -> compute_review_files() end)
  end

  defp compute_review_files do
    for project <- Projects.list_projects(),
        review <- Reviews.list_for_project(project) do
      %{review_id: review.id, files: Enum.reject(Reviews.list_files(review), & &1.soft_removed)}
    end
  end

  # Recomputes a single review's `:files` entry and merges it into the async
  # list off-render through `start_async/3`, so the resolved list stays visible
  # while the patch loads (no loading flash). If the prior snapshot is empty
  # (mount async had not resolved yet), we fall back to a full compute so
  # unrelated reviews still appear; otherwise we patch one entry in place.
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
    start_async(socket, :review_files, fn -> fun.(prior) end)
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

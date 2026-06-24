defmodule SuikouWeb.Stores.ReviewBodyStore do
  @moduledoc """
  Non-root store owning the live review-wide aggregates and the per-file child
  tree.

  The static review structure (name, kind, file list, per-file identity) is
  served separately by `SuikouWeb.Stores.ReviewStore`'s `load_review_structure`
  command and rendered from client state, so this snapshot carries only what must
  stream live: the file children (comments/verdicts), `has_unpublished`,
  `round_summaries`, the selected/latest round, and a `structure_version` the
  client watches to refetch the structure when the file list reshapes.

  The thin `SuikouWeb.Stores.ReviewStore` root mounts it with the `review_id`
  and forwards refresh signals to it. It loads the aggregates synchronously into
  assigns and the file list through `start_async/3` (used only to render the
  children, not exposed in the snapshot). `render/1` reads assigns only and never
  touches the database. The root targets a changed file's store directly (by its
  `artifact_id`), so this store only refreshes the aggregates and the file list —
  it never fans `Musubi.send_update/2` out to every child.
  """

  use Musubi.Store

  alias Musubi.AsyncResult
  alias Musubi.Child
  alias Musubi.Socket
  alias Suikou.Reads
  alias Suikou.Reviews
  alias Suikou.Schemas.Review
  alias Suikou.Submissions
  alias SuikouWeb.Stores.FileStore

  state do
    field(:files, list(FileStore.state()))
    field(:has_unpublished, boolean())

    field(
      :round_summaries,
      list(%{
        number: integer(),
        comment_count: integer(),
        unresolved_count: integer()
      })
    )

    # Review-wide viewed round. Every FileStore child renders against this same
    # number, so switching rounds moves the whole review at once rather than one
    # file at a time. `selected_round` is the effective number (latest when the
    # user has not picked one); `latest_round` lets the picker flag "under review".
    field(:selected_round, integer())
    field(:latest_round, integer())

    # Bumps whenever the review's static structure changes (a file opened or
    # removed, reshaping the file list). The client watches it and refetches
    # `load_review_structure` so the chrome and per-file identity stay current.
    # Comments, counts, and verdicts stream live and never touch this.
    field(:structure_version, integer())
  end

  @impl Musubi.Store
  @spec init(Socket.t()) :: {:ok, Socket.t()}
  def init(socket) do
    {:ok, socket |> Socket.assign(:structure_version, 0) |> reload_aggregates() |> load_files()}
  end

  @impl Musubi.Store
  @spec update(map(), Socket.t()) :: {:ok, Socket.t()}
  # A review-level change reshapes the file list, so reload the children and bump
  # the structure version to trigger a client structure refetch.
  def update(%{reload: :structure}, socket) do
    {:ok, socket |> bump_structure_version() |> reload_aggregates() |> load_files()}
  end

  # An artifact-scoped change only moves the review-wide counts; skip the static
  # chrome and the disk/git file walk and re-query the aggregates alone.
  def update(%{reload: :aggregates}, socket) do
    {:ok, reload_aggregates(socket)}
  end

  # A plain prop re-render (e.g. a round switch) needs no DB read — the new
  # props drive `render/1` and flow to the file children directly.
  def update(assigns, socket) do
    {:ok, Socket.assign(socket, assigns)}
  end

  @impl Musubi.Store
  @spec render(Socket.t()) :: map()
  def render(socket) do
    entries = socket.assigns[:file_entries] || AsyncResult.ok([])
    summaries = socket.assigns[:round_summaries] || []
    latest = summaries |> Enum.map(& &1.number) |> Enum.max(fn -> 0 end)

    %{
      files: render_file_children(entries, socket),
      has_unpublished: socket.assigns[:has_unpublished] || false,
      round_summaries: summaries,
      selected_round: socket.assigns[:round_number] || latest,
      latest_round: latest,
      structure_version: socket.assigns[:structure_version] || 0
    }
  end

  @impl Musubi.Store
  @spec handle_command(atom(), map(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_command(_command, _payload, socket), do: {:noreply, socket}

  @impl Musubi.Store
  @spec handle_async(:file_entries, {:ok, [map()]} | {:exit, term()}, Socket.t()) ::
          {:noreply, Socket.t()}
  def handle_async(:file_entries, {:ok, files}, socket) do
    prior = socket.assigns[:file_entries] || AsyncResult.loading()
    {:noreply, Socket.assign(socket, :file_entries, AsyncResult.ok(prior, files))}
  end

  def handle_async(:file_entries, {:exit, reason}, socket) do
    prior = socket.assigns[:file_entries] || AsyncResult.loading()
    {:noreply, Socket.assign(socket, :file_entries, AsyncResult.failed(prior, {:exit, reason}))}
  end

  defp bump_structure_version(socket) do
    Socket.assign(socket, :structure_version, (socket.assigns[:structure_version] || 0) + 1)
  end

  # Review-wide counts that any critique or verdict write can move. Both queries
  # are safe on a missing review (they read empty), so no `get_review` guard.
  defp reload_aggregates(socket) do
    review_id = socket.assigns.review_id

    socket
    |> Socket.assign(:has_unpublished, Submissions.unpublished?(review_id))
    |> Socket.assign(:round_summaries, Reads.review_round_summaries(review_id))
  end

  defp load_files(socket) do
    case Reviews.get_review(socket.assigns.review_id) do
      %Review{} = review ->
        socket
        |> ensure_loading()
        |> start_async(:file_entries, fn -> Reviews.list_files(review) end)

      nil ->
        Socket.assign(socket, :file_entries, AsyncResult.ok([]))
    end
  end

  # Seed a loading state for the first paint only. On refresh the field is
  # already an `%AsyncResult{}`, so we leave it untouched — `start_async` never
  # resets it, so the resolved file list stays visible and the UI does not
  # flash a skeleton while the fresh list loads.
  defp ensure_loading(socket) do
    case socket.assigns[:file_entries] do
      %AsyncResult{} -> socket
      _absent -> Socket.assign(socket, :file_entries, AsyncResult.loading())
    end
  end

  defp render_file_children(%AsyncResult{result: files}, socket) when is_list(files) do
    Enum.map(files, fn file ->
      Child.child(FileStore,
        id: file.artifact_id || file.path,
        review_id: socket.assigns.review_id,
        path: file.path,
        artifact_id: file.artifact_id,
        round_number: socket.assigns[:round_number]
      )
    end)
  end

  defp render_file_children(_other, _socket), do: []
end

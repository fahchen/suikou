defmodule SuikouWeb.Stores.ReviewBodyStore do
  @moduledoc """
  Non-root store owning the review-level chrome and the per-file child tree.

  The thin `SuikouWeb.Stores.ReviewStore` root mounts it with the `review_id`
  and forwards refresh signals to it. It loads the review name, kind, artifact
  summaries, and the review-wide aggregates (`has_unpublished`, `round_summaries`)
  synchronously into assigns, and the file list through `assign_async/3` so the
  first snapshot does not block on disk. Either way `render/1` reads assigns only
  and never touches the database. It renders one `SuikouWeb.Stores.FileStore`
  child per covered file. The root targets a changed file's store directly (by
  its `artifact_id`), so this store only refreshes the review-wide chrome and the
  file list — it never fans `Musubi.send_update/2` out to every child.
  """

  use Musubi.Store

  alias Musubi.AsyncResult
  alias Musubi.Child
  alias Musubi.Socket
  alias Suikou.Reads
  alias Suikou.Reviews
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.ReviewSource.FileSelection
  alias Suikou.Schemas.ReviewSource.GitDiff
  alias Suikou.Submissions
  alias SuikouWeb.Stores.FileStore
  alias SuikouWeb.Stores.ProjectBoardContract
  require ProjectBoardContract

  state do
    field(:name, String.t())
    field(:kind, :file | :diff)

    field(
      :artifacts,
      list(%{
        id: String.t(),
        title: String.t(),
        approved: boolean(),
        latest_round: integer() | nil
      })
    )

    ProjectBoardContract.review_files_async_field(:file_entries)

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
  end

  @impl Musubi.Store
  @spec init(Socket.t()) :: {:ok, Socket.t()}
  def init(socket) do
    {:ok, socket |> reload_static() |> reload_aggregates() |> load_files()}
  end

  @impl Musubi.Store
  @spec update(map(), Socket.t()) :: {:ok, Socket.t()}
  # A review-level change reshapes the file list, so reload everything.
  def update(%{reload: :structure}, socket) do
    {:ok, socket |> reload_static() |> reload_aggregates() |> load_files()}
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
      name: socket.assigns[:name] || "",
      kind: socket.assigns[:kind] || :file,
      artifacts: socket.assigns[:artifacts] || [],
      file_entries: entries,
      files: render_file_children(entries, socket),
      has_unpublished: socket.assigns[:has_unpublished] || false,
      round_summaries: summaries,
      selected_round: socket.assigns[:round_number] || latest,
      latest_round: latest
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

  # Static chrome that only a review-level change can move: name, kind, and the
  # artifact switcher list. Read on first paint and on a structural refresh, not
  # on an artifact-scoped one.
  defp reload_static(socket) do
    review_id = socket.assigns.review_id

    case Reviews.get_review(review_id) do
      %Review{} = review ->
        socket
        |> Socket.assign(:name, review.name)
        |> Socket.assign(:kind, review_kind(review))
        |> Socket.assign(
          :artifacts,
          Enum.map(Reads.list_review_artifacts(review_id), &render_artifact_summary/1)
        )

      nil ->
        socket
        |> Socket.assign(:name, "")
        |> Socket.assign(:kind, :file)
        |> Socket.assign(:artifacts, [])
    end
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
        content_hash: file.content_hash,
        change_status: file.change_status,
        round_number: socket.assigns[:round_number]
      )
    end)
  end

  defp render_file_children(_other, _socket), do: []

  defp render_artifact_summary(%Artifact{} = artifact) do
    %{
      id: artifact.id,
      title: artifact.title,
      approved: not is_nil(artifact.approved_round),
      latest_round: Rounds.latest_number(artifact.id)
    }
  end

  defp review_kind(%Review{source: %GitDiff{}}), do: :diff
  defp review_kind(%Review{source: %FileSelection{}}), do: :file
end

defmodule SuikouWeb.Stores.ReviewBodyStore do
  @moduledoc """
  Non-root store owning the review-level chrome and the per-file child tree.

  The thin `SuikouWeb.Stores.ReviewStore` root mounts it with the `review_id`
  and forwards refresh signals to it. It loads the review name, kind, artifact
  summaries, and the review-wide aggregates (`has_unpublished`, `round_summaries`)
  synchronously into assigns, and the file list through `assign_async/3` so the
  first snapshot does not block on disk. Either way `render/1` reads assigns only
  and never touches the database. It renders one `SuikouWeb.Stores.FileStore`
  child per covered file; on every refresh it reloads its assigns and fans a
  `Musubi.send_update/2` out to each child so file-scoped state (round comment
  counts, verdict chips) picks up changes whose file props did not change.
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
  def init(socket), do: {:ok, socket |> reload_chrome() |> load_files()}

  @impl Musubi.Store
  @spec update(map(), Socket.t()) :: {:ok, Socket.t()}
  def update(assigns, socket) do
    socket =
      socket
      |> Socket.assign(assigns)
      |> reload_chrome()
      |> maybe_load_files(assigns)

    fan_out(socket)
    {:ok, socket}
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
    socket = Socket.assign(socket, :file_entries, AsyncResult.ok(prior, files))
    {:noreply, fan_out(socket)}
  end

  def handle_async(:file_entries, {:exit, reason}, socket) do
    prior = socket.assigns[:file_entries] || AsyncResult.loading()
    {:noreply, Socket.assign(socket, :file_entries, AsyncResult.failed(prior, {:exit, reason}))}
  end

  # Cheap review-wide chrome, read synchronously into assigns on every refresh.
  defp reload_chrome(socket) do
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
        |> Socket.assign(:has_unpublished, Submissions.unpublished?(review_id))
        |> Socket.assign(:round_summaries, Reads.review_round_summaries(review_id))

      nil ->
        socket
        |> Socket.assign(:name, "")
        |> Socket.assign(:kind, :file)
        |> Socket.assign(:artifacts, [])
        |> Socket.assign(:file_entries, AsyncResult.ok([]))
        |> Socket.assign(:has_unpublished, false)
        |> Socket.assign(:round_summaries, [])
    end
  end

  # The file list loads off-render through `assign_async/3`. `update/2` runs on
  # every parent render, so re-spawn only on a real refresh (an empty
  # `Musubi.send_update/2`) — a plain prop re-render keeps the in-flight or
  # resolved result instead of cancelling and reloading it every frame.
  defp maybe_load_files(socket, assigns) when map_size(assigns) == 0, do: load_files(socket)

  defp maybe_load_files(socket, _assigns) do
    case socket.assigns[:file_entries] do
      %AsyncResult{} -> socket
      _absent -> load_files(socket)
    end
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

  # Re-render keeps the child set stable, but Musubi memoizes a child whose props
  # are unchanged. A comment write leaves a file's props identical yet must
  # refresh its round counts and thread, so nudge every child explicitly.
  defp fan_out(socket) do
    base = Socket.store_id(socket)

    for entry <- entries(socket) do
      Musubi.send_update(base ++ ["files", entry.artifact_id || entry.path], %{})
    end

    socket
  end

  defp entries(socket) do
    case socket.assigns[:file_entries] do
      %AsyncResult{result: files} when is_list(files) -> files
      _other -> []
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

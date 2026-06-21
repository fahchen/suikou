defmodule SuikouWeb.Stores.ReviewStore do
  @moduledoc """
  Root store backing the human review surface for a single review.

  Mounts against a `review_id`, loads the review-level chrome and file list,
  and renders one `SuikouWeb.Stores.FileStore` child per covered file. Each
  child owns the file-scoped round, verdict, and comment-thread state.
  """

  use Musubi.Store, root: true

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
  alias Suikou.Schemas.Round
  alias Suikou.Submissions
  alias SuikouWeb.Stores.CommentBroadcast
  alias SuikouWeb.Stores.FileStore
  alias SuikouWeb.Stores.ProjectBoardContract
  require ProjectBoardContract

  state do
    field(:review_id, String.t())
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

  command :submit_review do
    reply do
      field(:warnings, list(String.t()))
    end
  end

  command :select_round do
    payload do
      field(:number, integer())
    end
  end

  command :remove_file do
    payload do
      field(:path, String.t())
    end
  end

  @impl Musubi.Store
  @spec mount(map(), Socket.t()) :: {:ok, Socket.t()}
  def mount(params, socket) do
    review_id = Map.fetch!(params, "review_id")
    CommentBroadcast.subscribe(review_id)

    socket =
      socket
      |> Socket.assign(:review_id, review_id)
      |> Socket.assign(:reload_token, 0)
      |> refresh_files()

    {:ok, socket}
  end

  @impl Musubi.Store
  @spec handle_info(:comments_changed, Socket.t()) :: {:noreply, Socket.t()}
  def handle_info(:comments_changed, socket) do
    {:noreply, socket |> refresh_files() |> bump_reload_token()}
  end

  @impl Musubi.Store
  @spec render(Socket.t()) :: map()
  def render(socket) do
    case Reviews.get_review(socket.assigns.review_id) do
      %Review{} = review -> present_snapshot(review, socket)
      nil -> missing_snapshot(socket)
    end
  end

  @impl Musubi.Store
  @spec handle_command(:submit_review, map(), Socket.t()) :: {:reply, map(), Socket.t()}
  def handle_command(:submit_review, _payload, socket) do
    {warnings, submitted?} =
      socket.assigns.review_id
      |> Reads.list_review_artifacts()
      |> Enum.reduce({[], false}, &submit_artifact/2)

    if submitted? do
      CommentBroadcast.broadcast(socket.assigns.review_id)
    end

    next_socket =
      if submitted? do
        socket |> refresh_files() |> bump_reload_token()
      else
        socket
      end

    {:reply, %{warnings: warnings}, next_socket}
  end

  @spec handle_command(:select_round, map(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_command(:select_round, payload, socket) do
    {:noreply, Socket.assign(socket, :round_number, payload["number"])}
  end

  @spec handle_command(:remove_file, map(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_command(:remove_file, payload, socket) do
    case Reviews.get_review(socket.assigns.review_id) do
      %Review{} = review ->
        _result = Reviews.remove_file(review, payload["path"])
        CommentBroadcast.broadcast(socket.assigns.review_id)
        {:noreply, socket |> refresh_files() |> bump_reload_token()}

      nil ->
        {:noreply, socket}
    end
  end

  defp present_snapshot(%Review{} = review, socket) do
    file_entries = Map.get(socket.assigns, :file_entries, AsyncResult.loading())
    summaries = Reads.review_round_summaries(review.id)
    latest = summaries |> Enum.map(& &1.number) |> Enum.max(fn -> 0 end)

    %{
      review_id: review.id,
      name: review.name,
      kind: review_kind(review),
      artifacts: Enum.map(Reads.list_review_artifacts(review.id), &render_artifact_summary/1),
      file_entries: file_entries,
      files: render_file_children(file_entries, socket),
      has_unpublished: Submissions.unpublished?(review.id),
      round_summaries: summaries,
      selected_round: socket.assigns[:round_number] || latest,
      latest_round: latest
    }
  end

  defp missing_snapshot(socket) do
    %{
      review_id: socket.assigns.review_id,
      name: "",
      kind: :file,
      artifacts: [],
      file_entries: Map.get(socket.assigns, :file_entries, AsyncResult.loading()),
      files: [],
      has_unpublished: false,
      round_summaries: [],
      selected_round: 0,
      latest_round: 0
    }
  end

  # Match on the result list regardless of status: a refresh transitions the
  # field to `:loading` while preserving the prior list (assign_async reset:
  # false), so rendering from it keeps the child set stable instead of emptying
  # `files` mid-refresh — which would tear the active file view down to the
  # loading skeleton and remount it (a visible flash on every comment write).
  defp render_file_children(%AsyncResult{result: files}, socket)
       when is_list(files) do
    Enum.map(files, fn file ->
      Child.child(FileStore,
        id: file.artifact_id || file.path,
        review_id: socket.assigns.review_id,
        path: file.path,
        artifact_id: file.artifact_id,
        content_hash: file.content_hash,
        change_status: file.change_status,
        round_number: socket.assigns[:round_number],
        reload_token: socket.assigns.reload_token
      )
    end)
  end

  defp render_file_children(_other, _socket), do: []

  defp submit_artifact(%Artifact{} = artifact, {warnings, submitted?}) do
    case {verdict_to_submit(artifact), Rounds.latest(artifact.id)} do
      {nil, _round} ->
        {warnings, submitted?}

      {_verdict, nil} ->
        {warnings, submitted?}

      {verdict, %Round{} = round} ->
        case Submissions.submit(round.id, verdict) do
          {:ok, %{warnings: round_warnings}} ->
            next_warnings =
              warnings ++ Enum.map(round_warnings, &Atom.to_string/1)

            {next_warnings, true}

          {:error, _reason} ->
            {warnings, submitted?}
        end
    end
  end

  # A file's submit verdict: its draft chip, or an implicit `comment` when it has
  # only pending comments — so submitting a review with feedback but no verdicts
  # still publishes that critique. Untouched files stay nil and are skipped.
  defp verdict_to_submit(%Artifact{} = artifact) do
    case Submissions.draft_verdict_for_artifact(artifact.id) do
      nil -> if Submissions.comments_pending?(artifact.id), do: :comment
      verdict -> verdict
    end
  end

  defp review_kind(%Review{source: %GitDiff{}}), do: :diff
  defp review_kind(%Review{source: %FileSelection{}}), do: :file

  defp render_artifact_summary(%Artifact{} = artifact) do
    %{
      id: artifact.id,
      title: artifact.title,
      approved: not is_nil(artifact.approved_round),
      latest_round: Rounds.latest_number(artifact.id)
    }
  end

  defp refresh_files(socket) do
    review_id = socket.assigns.review_id
    assign_async(socket, :file_entries, fn -> {:ok, fetch_files(review_id)} end)
  end

  defp fetch_files(review_id) do
    case Reviews.get_review(review_id) do
      %Review{} = review -> Reviews.list_files(review)
      nil -> []
    end
  end

  defp bump_reload_token(socket) do
    Socket.assign(socket, :reload_token, System.unique_integer())
  end
end

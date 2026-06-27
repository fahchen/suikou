defmodule SuikouWeb.Stores.ReviewStore do
  @moduledoc """
  Thin root store backing the human review surface for a single review.

  It owns only the `review_id` and the review-wide commands (`submit_review`,
  `remove_file`), and mounts a single `SuikouWeb.Stores.ReviewBodyStore` child
  that owns the review chrome, file list, and aggregates. It subscribes to the
  review's `Suikou.Events` change topic at mount and forwards every change to the
  body child via `Musubi.send_update/2`, so a mutation on any page refreshes the
  tree. The domain contexts emit the event after each persisted write, so the
  writer's own page refreshes through the same path as every other open tab.
  """

  use Musubi.Store, root: true

  alias Musubi.Child
  alias Musubi.Socket
  alias Suikou.Events
  alias Suikou.FileWatcher
  alias Suikou.Reads
  alias Suikou.Reviews
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.ReviewSource.FileSelection
  alias Suikou.Schemas.ReviewSource.GitDiff
  alias Suikou.Schemas.Round
  alias Suikou.Submissions
  alias SuikouWeb.Stores.ProjectBoardContract
  alias SuikouWeb.Stores.ReviewBodyStore
  require ProjectBoardContract

  state do
    field(:review_id, String.t())
    field(:body, ReviewBodyStore.state())
  end

  # Request-response load of the review's static structure: chrome (name/kind),
  # the file list, and each file's content identity. The client renders the
  # chrome, file list, and navigation from this reply (held in component state)
  # instead of the live snapshot, so a hard WebSocket disconnect leaves them
  # intact; only the comment overlay and counters — which stay on the live
  # snapshot — briefly placeholder. The client refetches on mount, on socket
  # reconnect, and when the live `structure_version` bumps. File content still
  # streams over HTTP (`AssetController`), keyed by the hashes carried here.
  command :load_review_structure do
    reply do
      field(:review_id, String.t())
      # False when no review has this id, so the client can tell a missing review
      # apart from a real-but-empty one and render "review not found" rather than
      # "file not found".
      field(:exists, boolean())
      field(:name, String.t())
      field(:kind, :file | :diff)
      field(:latest_round, integer())

      ProjectBoardContract.review_files_reply_field(:file_entries)

      field(
        :files,
        list(%{
          path: String.t(),
          artifact_id: String.t() | nil,
          content_hash: String.t() | nil,
          artifact: %{id: String.t(), title: String.t()} | nil,
          current_round: %{content_hash: String.t()} | nil
        })
      )
    end
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
    Events.subscribe(review_id)
    watch_files(review_id)
    {:ok, Socket.assign(socket, :review_id, review_id)}
  end

  # Start (or join) the review's file watcher, ref-counted by this store process.
  # Watches the review's raw selections (files/dirs) so creates under a selected
  # dir are noticed. Skipped when the review is gone, its project dir is missing,
  # or it has no on-disk selections (a git-diff review), so a stale link still
  # loads the page (just without the live-refresh signal).
  defp watch_files(review_id) do
    with %Review{project: project} = review <- Reviews.get_review(review_id),
         true <- File.dir?(project.path),
         [_first | _rest] = selections <- selections(review) do
      FileWatcher.subscribe(review_id, project.path, selections)
    else
      _absent -> :ok
    end
  end

  defp selections(%Review{source: %FileSelection{selection_paths: paths}}), do: paths
  defp selections(%Review{source: %GitDiff{}}), do: []

  @impl Musubi.Store
  @spec handle_info(Events.message(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_info({:review_changed, _review_id, artifact_id}, socket) do
    # The body's store id is this root's path plus the "body" segment; appending
    # is the path, not an inefficient list build.
    # credo:disable-for-next-line Credo.Check.Refactor.AppendSingleItem
    body = Socket.store_id(socket) ++ ["body"]

    # The `reload` tag tells the body which slice to re-query: a review-level
    # change (file opened/removed) reshapes the file list and the static chrome,
    # so it reloads everything; an artifact-scoped change (a comment, reply, or
    # verdict) only moves the review-wide aggregates, so the body skips the
    # disk/git file walk and the static chrome and re-queries the counts alone.
    # The changed file's own store and comment thread refresh by their
    # deterministic ids, never the whole tree. No store fans out from `update/2`,
    # so a refresh cannot feed itself into a render loop.
    if is_binary(artifact_id) do
      Musubi.send_update(body, %{reload: :aggregates})
      file = body ++ ["files", artifact_id]
      Musubi.send_update(file, %{})
      # credo:disable-for-next-line Credo.Check.Refactor.AppendSingleItem
      Musubi.send_update(file ++ ["comments"], %{})
    else
      Musubi.send_update(body, %{reload: :structure})
    end

    {:noreply, socket}
  end

  # A watched file changed on disk: forward the path and whether it still exists
  # to the body, which either marks the file stale or re-derives the file list
  # (a create or delete).
  def handle_info({:files_changed, _review_id, rel_path, exists?}, socket) do
    # credo:disable-for-next-line Credo.Check.Refactor.AppendSingleItem
    body = Socket.store_id(socket) ++ ["body"]
    Musubi.send_update(body, %{disk_changed: rel_path, exists: exists?})
    {:noreply, socket}
  end

  @impl Musubi.Store
  @spec render(Socket.t()) :: map()
  def render(socket) do
    %{
      review_id: socket.assigns.review_id,
      body:
        Child.child(ReviewBodyStore,
          id: "body",
          review_id: socket.assigns.review_id,
          round_number: socket.assigns[:round_number]
        )
    }
  end

  @impl Musubi.Store
  @spec handle_command(:load_review_structure, map(), Socket.t()) :: {:reply, map(), Socket.t()}
  def handle_command(:load_review_structure, _payload, socket) do
    review_id = socket.assigns.review_id

    reply =
      case Reviews.get_review(review_id) do
        %Review{} = review ->
          entries = Reviews.list_files(review)

          %{
            review_id: review_id,
            exists: true,
            name: review.name,
            kind: review_kind(review),
            latest_round: latest_round(review_id),
            file_entries: entries,
            files: Enum.map(entries, &file_identity/1)
          }

        nil ->
          %{
            review_id: review_id,
            exists: false,
            name: "",
            kind: :file,
            latest_round: 0,
            file_entries: [],
            files: []
          }
      end

    {:reply, reply, socket}
  end

  @spec handle_command(:submit_review, map(), Socket.t()) :: {:reply, map(), Socket.t()}
  def handle_command(:submit_review, _payload, socket) do
    warnings =
      socket.assigns.review_id
      |> Reads.list_review_artifacts()
      |> Enum.reduce([], &submit_artifact/2)

    {:reply, %{warnings: warnings}, socket}
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
        {:noreply, socket}

      nil ->
        {:noreply, socket}
    end
  end

  defp submit_artifact(%Artifact{} = artifact, warnings) do
    case {verdict_to_submit(artifact), Rounds.latest(artifact.id)} do
      {nil, _round} ->
        warnings

      {_verdict, nil} ->
        warnings

      {verdict, %Round{} = round} ->
        case Submissions.submit(round.id, verdict) do
          {:ok, %{warnings: round_warnings}} ->
            warnings ++ Enum.map(round_warnings, &Atom.to_string/1)

          {:error, _reason} ->
            warnings
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

  defp latest_round(review_id) do
    review_id
    |> Reads.review_round_summaries()
    |> Enum.map(& &1.number)
    |> Enum.max(fn -> 0 end)
  end

  # Per-file content identity: the title and content hashes the client feeds to
  # the HTTP content route. An unminted file (no artifact yet) carries `nil`
  # artifact/current_round; the client falls back to the path as its title and
  # fetches by path through the review file-content route.
  defp file_identity(%{path: path, artifact_id: artifact_id, content_hash: content_hash}) do
    %{
      path: path,
      artifact_id: artifact_id,
      content_hash: content_hash,
      artifact: artifact_identity(artifact_id),
      current_round: current_round_identity(artifact_id)
    }
  end

  defp artifact_identity(nil), do: nil

  defp artifact_identity(artifact_id) do
    case Reads.get_artifact(artifact_id) do
      %Artifact{} = artifact -> %{id: artifact.id, title: artifact.title}
      nil -> nil
    end
  end

  defp current_round_identity(nil), do: nil

  defp current_round_identity(artifact_id) do
    case Rounds.latest(artifact_id) do
      %Round{content_hash: content_hash} -> %{content_hash: content_hash}
      nil -> nil
    end
  end
end

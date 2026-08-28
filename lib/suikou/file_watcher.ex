defmodule Suikou.FileWatcher do
  @moduledoc """
  Per-review file watcher: one process per `review_id`, found by id through a
  `Registry` and ref-counted by the connected review stores. The first store to
  `subscribe/3` starts it (under a `DynamicSupervisor`); each subscriber is
  monitored, and the watcher stops itself when the last one exits — so closing
  or navigating away from every page of a review tears the watcher down, and
  multiple open pages of the same review share one watcher.

  It watches exactly the review's selections, across both of its content roots:
  a directory selection watches that directory (so files added under it are
  noticed), a file selection watches just that file (via its parent directory,
  filtering out unrelated siblings). Each relevant change broadcasts
  `Suikou.Events.fs_changed/3` with whether the path still exists, so the client
  can add, refresh, or drop the file.
  """

  use GenServer

  alias Suikou.Events
  alias Suikou.ReviewRoots
  alias Suikou.Schemas.Review

  @registry Suikou.FileWatcher.Registry
  @supervisor Suikou.FileWatcher.Supervisor

  @doc """
  Maps an absolute changed path to its review-relative path when it is one of the
  review's selections — a file selection by exact match, or any path under a
  directory selection. A change under the scratch root comes back marked, so the
  path matches the selection it belongs to. Anything else (an unrelated sibling,
  a path under neither root) yields `nil`.

  ## Examples

      iex> review = %Suikou.Schemas.Review{project_path: "/proj", scratch_path: "/data/r1"}
      iex> Suikou.FileWatcher.changed_path("/proj/lib/a.ex", review, MapSet.new(["lib/a.ex"]), [])
      "lib/a.ex"

      iex> review = %Suikou.Schemas.Review{project_path: "/proj", scratch_path: "/data/r1"}
      iex> Suikou.FileWatcher.changed_path("/data/r1/report.md", review, MapSet.new([]), ["@scratch"])
      "@scratch/report.md"

      iex> review = %Suikou.Schemas.Review{project_path: "/proj", scratch_path: "/data/r1"}
      iex> Suikou.FileWatcher.changed_path("/proj/lib/other.ex", review, MapSet.new(["lib/a.ex"]), [])
      nil

  """
  @spec changed_path(String.t(), Review.t(), MapSet.t(String.t()), [String.t()]) ::
          String.t() | nil
  def changed_path(abs_path, %Review{} = review, file_sels, dir_sels) do
    case ReviewRoots.relativize(review, abs_path) do
      nil ->
        nil

      rel ->
        cond do
          MapSet.member?(file_sels, rel) -> rel
          Enum.any?(dir_sels, &under?(rel, &1)) -> rel
          true -> nil
        end
    end
  end

  @doc """
  Ensures the watcher for `review_id` is running and registers the calling
  process as a subscriber (monitored for ref-counting). `selections` are the
  review's raw selection paths (files and/or directories), relative to the
  project root. Idempotent per caller.

  ## Examples

      Suikou.FileWatcher.subscribe(review, ["lib/a.ex", "docs"])
      #=> :ok

  """
  @spec subscribe(Review.t(), [String.t()]) :: :ok
  def subscribe(%Review{} = review, selections) do
    pid = ensure_started(review, selections)
    GenServer.call(pid, {:subscribe, self()})
  end

  @spec start_link({Review.t(), [String.t()]}) :: GenServer.on_start()
  def start_link({review, _selections} = arg) do
    GenServer.start_link(__MODULE__, arg, name: via(review.id))
  end

  @impl GenServer
  @spec init({Review.t(), [String.t()]}) :: {:ok, map()}
  def init({%Review{} = review, selections}) do
    review_id = review.id

    {dir_sels, file_sels} =
      Enum.split_with(selections, &dir_selection?(review, &1))

    # Subscriber defaults to this GenServer; the OS watch stops automatically
    # when it dies, so no terminate cleanup is needed. `debounce` coalesces the
    # burst of events an editor save fires. Run inert if watching fails (e.g. an
    # unsupported target): the watcher still ref-counts subscribers and tears
    # down cleanly, the page just gets no live-refresh signal — J5.
    ref =
      case FsNotify.watch(watch_dirs(review, file_sels, dir_sels),
             recursive: true,
             debounce: 50
           ) do
        {:ok, ref} -> ref
        {:error, _reason} -> nil
      end

    {:ok,
     %{
       review_id: review_id,
       review: review,
       file_sels: MapSet.new(file_sels),
       dir_sels: dir_sels,
       subs: MapSet.new(),
       ref: ref
     }}
  end

  # Watch the directory selections directly and the parent directories of file
  # selections — never the whole project root, which would flood mac_listener on
  # _build / deps / node_modules / .git churn. ponytail: a file selected at the
  # repo root still pulls in the root; that's inherent to where the file lives.
  defp watch_dirs(%Review{} = review, file_sels, dir_sels) do
    dirs =
      (Enum.map(dir_sels, &absolute(review, &1)) ++
         Enum.map(file_sels, &absolute(review, Path.dirname(&1))))
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()
      |> Enum.filter(&File.dir?/1)

    if dirs == [], do: [review.project_path], else: dirs
  end

  defp dir_selection?(%Review{} = review, selection) do
    case absolute(review, selection) do
      nil -> false
      path -> File.dir?(path)
    end
  end

  defp absolute(%Review{} = review, path) do
    case ReviewRoots.absolute(review, path) do
      {:ok, absolute} -> absolute
      {:error, :unsafe_path} -> nil
    end
  end

  @impl GenServer
  def handle_call({:subscribe, pid}, _from, state) do
    Process.monitor(pid)
    {:reply, :ok, %{state | subs: MapSet.put(state.subs, pid)}}
  end

  @impl GenServer
  def handle_info({:DOWN, _ref, :process, pid, _reason}, state) do
    subs = MapSet.delete(state.subs, pid)

    if MapSet.size(subs) == 0 do
      {:stop, :normal, state}
    else
      {:noreply, %{state | subs: subs}}
    end
  end

  # One message per event; `paths` carries every affected path (a rename is
  # `[from, to]`), so fan each through the selection filter.
  def handle_info({:fs_notify_event, %FsNotify.Event{paths: paths}}, state) do
    for abs_path <- paths,
        rel = changed_path(abs_path, state.review, state.file_sels, state.dir_sels),
        rel != nil do
      Events.fs_changed(state.review_id, rel, File.exists?(abs_path))
    end

    {:noreply, state}
  end

  defp under?(rel, dir), do: rel == dir or String.starts_with?(rel, dir <> "/")

  # Start the watcher under the DynamicSupervisor, tolerating the start race:
  # two stores subscribing at once, the loser gets the already-started pid.
  defp ensure_started(%Review{} = review, selections) do
    spec = %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [{review, selections}]},
      restart: :temporary
    }

    case DynamicSupervisor.start_child(@supervisor, spec) do
      {:ok, pid} -> pid
      {:error, {:already_started, pid}} -> pid
    end
  end

  defp via(review_id), do: {:via, Registry, {@registry, review_id}}
end

defmodule Suikou.FileWatcher do
  @moduledoc """
  Per-review file watcher: one process per `review_id`, found by id through a
  `Registry` and ref-counted by the connected review stores. The first store to
  `subscribe/3` starts it (under a `DynamicSupervisor`); each subscriber is
  monitored, and the watcher stops itself when the last one exits — so closing
  or navigating away from every page of a review tears the watcher down, and
  multiple open pages of the same review share one watcher.

  It watches exactly the review's selections: a directory selection watches that
  directory (so files added under it are noticed), a file selection watches just
  that file (via its parent directory, filtering out unrelated siblings). Each
  relevant change broadcasts `Suikou.Events.files_changed/3` with whether the
  path still exists, so the client can add, refresh, or drop the file.
  """

  use GenServer

  alias Suikou.Events

  @registry Suikou.FileWatcher.Registry
  @supervisor Suikou.FileWatcher.Supervisor

  @doc """
  Maps an absolute changed path to its review-relative path when it is one of the
  review's selections — a file selection by exact match, or any path under a
  directory selection. Anything else (an unrelated sibling, a path outside the
  project) yields `nil`.

  ## Examples

      iex> Suikou.FileWatcher.changed_path("/proj/lib/a.ex", "/proj", MapSet.new(["lib/a.ex"]), [])
      "lib/a.ex"

      iex> Suikou.FileWatcher.changed_path("/proj/docs/new.md", "/proj", MapSet.new([]), ["docs"])
      "docs/new.md"

      iex> Suikou.FileWatcher.changed_path("/proj/lib/other.ex", "/proj", MapSet.new(["lib/a.ex"]), [])
      nil

  """
  @spec changed_path(String.t(), String.t(), MapSet.t(String.t()), [String.t()]) ::
          String.t() | nil
  def changed_path(abs_path, project_path, file_sels, dir_sels) do
    rel = Path.relative_to(abs_path, project_path)

    cond do
      MapSet.member?(file_sels, rel) -> rel
      Enum.any?(dir_sels, &under?(rel, &1)) -> rel
      true -> nil
    end
  end

  @doc """
  Ensures the watcher for `review_id` is running and registers the calling
  process as a subscriber (monitored for ref-counting). `selections` are the
  review's raw selection paths (files and/or directories), relative to the
  project root. Idempotent per caller.

  ## Examples

      Suikou.FileWatcher.subscribe("01HZ...", "/proj", ["lib/a.ex", "docs"])
      #=> :ok

  """
  @spec subscribe(String.t(), String.t(), [String.t()]) :: :ok
  def subscribe(review_id, project_path, selections) do
    pid = ensure_started(review_id, project_path, selections)
    GenServer.call(pid, {:subscribe, self()})
  end

  @spec start_link({String.t(), String.t(), [String.t()]}) :: GenServer.on_start()
  def start_link({review_id, _project_path, _selections} = arg) do
    GenServer.start_link(__MODULE__, arg, name: via(review_id))
  end

  @impl GenServer
  @spec init({String.t(), String.t(), [String.t()]}) :: {:ok, map()}
  def init({review_id, project_path, selections}) do
    {dir_sels, file_sels} =
      Enum.split_with(selections, &File.dir?(Path.join(project_path, &1)))

    {:ok, fs} = FileSystem.start_link(dirs: watch_dirs(project_path, file_sels, dir_sels))
    FileSystem.subscribe(fs)

    {:ok,
     %{
       review_id: review_id,
       project_path: project_path,
       file_sels: MapSet.new(file_sels),
       dir_sels: dir_sels,
       subs: MapSet.new(),
       fs: fs
     }}
  end

  # Watch the directory selections directly and the parent directories of file
  # selections — never the whole project root, which would flood mac_listener on
  # _build / deps / node_modules / .git churn. ponytail: a file selected at the
  # repo root still pulls in the root; that's inherent to where the file lives.
  defp watch_dirs(project_path, file_sels, dir_sels) do
    dirs =
      (Enum.map(dir_sels, &Path.join(project_path, &1)) ++
         Enum.map(file_sels, &Path.join(project_path, Path.dirname(&1))))
      |> Enum.uniq()
      |> Enum.filter(&File.dir?/1)

    if dirs == [], do: [project_path], else: dirs
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

  def handle_info({:file_event, fs, {abs_path, _events}}, %{fs: fs} = state) do
    case changed_path(abs_path, state.project_path, state.file_sels, state.dir_sels) do
      nil -> :ok
      rel -> Events.files_changed(state.review_id, rel, File.exists?(abs_path))
    end

    {:noreply, state}
  end

  def handle_info({:file_event, fs, :stop}, %{fs: fs} = state), do: {:noreply, state}

  defp under?(rel, dir), do: rel == dir or String.starts_with?(rel, dir <> "/")

  # Start the watcher under the DynamicSupervisor, tolerating the start race:
  # two stores subscribing at once, the loser gets the already-started pid.
  defp ensure_started(review_id, project_path, selections) do
    spec = %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [{review_id, project_path, selections}]},
      restart: :temporary
    }

    case DynamicSupervisor.start_child(@supervisor, spec) do
      {:ok, pid} -> pid
      {:error, {:already_started, pid}} -> pid
    end
  end

  defp via(review_id), do: {:via, Registry, {@registry, review_id}}
end

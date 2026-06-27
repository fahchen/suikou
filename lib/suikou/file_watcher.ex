defmodule Suikou.FileWatcher do
  @moduledoc """
  Per-review file watcher: one process per `review_id`, found by id through a
  `Registry` and ref-counted by the connected review stores. The first store to
  `subscribe/3` starts it (under a `DynamicSupervisor`); each subscriber is
  monitored, and the watcher stops itself when the last one exits — so closing
  or navigating away from every page of a review tears the watcher down, and
  multiple open pages of the same review share one watcher.

  It watches the review's project directory with `FileSystem` and broadcasts
  `Suikou.Events.files_changed/2` for each change whose path is in the review's
  file set.
  """

  use GenServer

  alias Suikou.Events

  @registry Suikou.FileWatcher.Registry
  @supervisor Suikou.FileWatcher.Supervisor

  @doc """
  Maps an absolute changed path to its review-relative path when it belongs to
  the watched set, else `nil`. A path outside `project_path` (or simply not in
  the set) yields `nil`.

  ## Examples

      iex> set = MapSet.new(["lib/a.ex"])
      iex> Suikou.FileWatcher.relative_for("/proj/lib/a.ex", "/proj", set)
      "lib/a.ex"

      iex> set = MapSet.new(["lib/a.ex"])
      iex> Suikou.FileWatcher.relative_for("/etc/passwd", "/proj", set)
      nil

  """
  @spec relative_for(String.t(), String.t(), MapSet.t(String.t())) :: String.t() | nil
  def relative_for(abs_path, project_path, rel_set) do
    rel = Path.relative_to(abs_path, project_path)
    if MapSet.member?(rel_set, rel), do: rel, else: nil
  end

  @doc """
  Ensures the watcher for `review_id` is running and registers the calling
  process as a subscriber (monitored for ref-counting). Idempotent per caller.

  ## Examples

      Suikou.FileWatcher.subscribe("01HZ...", "/proj", ["lib/a.ex"])
      #=> :ok

  """
  @spec subscribe(String.t(), String.t(), [String.t()]) :: :ok
  def subscribe(review_id, project_path, rel_paths) do
    pid = ensure_started(review_id, project_path, rel_paths)
    GenServer.call(pid, {:subscribe, self()})
  end

  @spec start_link({String.t(), String.t(), [String.t()]}) :: GenServer.on_start()
  def start_link({review_id, _project_path, _rel_paths} = arg) do
    GenServer.start_link(__MODULE__, arg, name: via(review_id))
  end

  @impl GenServer
  @spec init({String.t(), String.t(), [String.t()]}) :: {:ok, map()}
  def init({review_id, project_path, rel_paths}) do
    {:ok, fs} = FileSystem.start_link(dirs: [project_path])
    FileSystem.subscribe(fs)

    {:ok,
     %{
       review_id: review_id,
       project_path: project_path,
       rel_set: MapSet.new(rel_paths),
       subs: MapSet.new(),
       fs: fs
     }}
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
    case relative_for(abs_path, state.project_path, state.rel_set) do
      nil -> :ok
      rel -> Events.files_changed(state.review_id, rel)
    end

    {:noreply, state}
  end

  def handle_info({:file_event, fs, :stop}, %{fs: fs} = state), do: {:noreply, state}

  # Start the watcher under the DynamicSupervisor, tolerating the start race:
  # two stores subscribing at once, the loser gets the already-started pid.
  defp ensure_started(review_id, project_path, rel_paths) do
    spec = %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [{review_id, project_path, rel_paths}]},
      restart: :temporary
    }

    case DynamicSupervisor.start_child(@supervisor, spec) do
      {:ok, pid} -> pid
      {:error, {:already_started, pid}} -> pid
    end
  end

  defp via(review_id), do: {:via, Registry, {@registry, review_id}}
end

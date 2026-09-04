defmodule Suikou.ChangesWatcher do
  @moduledoc """
  Per-review changes cache: one process per `review_id`, found by id through a
  `Registry` and ref-counted by the connected review stores. Sibling to
  `Suikou.FileWatcher` — that one watches the disk and broadcasts `fs_changed`;
  this one owns the review's *computed changes*: the file list with each file's
  content hash, diff status and `+N / −M` stats, plus each file's live unified
  diff content, all keyed by the reviewer's scope × worktree lens.

  The first caller to `subscribe/1` starts it (under a `DynamicSupervisor`) and
  is monitored; the watcher stops itself a short grace period after the last
  subscriber leaves, so a websocket reconnect or a second open page of the same
  review reuses the warm cache instead of re-walking git. A stateless HTTP
  caller reaches it through `list_files/2` or `fetch_content/3`, which start it
  on demand without ref-counting it — so an HTTP-only spin-up also tears down
  after the grace window.

  It is the review's sole `Suikou.Events` subscriber: on any review-level change
  (comment, file opened/removed) or watched-file edit it drops its
  caches and then relays the event to every connected store, which routes the
  refresh into Musubi. Invalidating before relaying means a store's follow-up
  refetch never races an unswept cache.

  ## ponytail caveat

  External git activity that no `Suikou.Events` covers — a `git commit` on the
  head ref, or an unstaged/staged edit in a diff review (which starts no
  `FileWatcher`) — is not observed, so the same lens can serve a stale result
  until an event fires, the reviewer switches lens, or the process ages out and
  restarts. Every read was live before this cache; add a git-HEAD/index poll to
  invalidate if that staleness ever bites.
  """

  use GenServer

  alias Suikou.Events
  alias Suikou.Reviews
  alias Suikou.Schemas.Review

  @registry Suikou.ChangesWatcher.Registry
  @supervisor Suikou.ChangesWatcher.Supervisor

  # ponytail: 30 s warm window bridges reconnects and page nav; raise if reconnect
  # gaps ever exceed it. Overridden short in test via config.
  @grace_ms Application.compile_env(:suikou, :changes_watcher_grace_ms, 30_000)

  @typep lens() :: %{optional(:scope) => term(), optional(:worktree) => atom()}
  @typep content_source() :: {:file, String.t()} | {:inline, binary(), String.t()}

  @doc """
  Ensures the watcher for `review_id` is running and registers the caller as a
  monitored subscriber, ref-counting the process so it lives as long as at least
  one subscriber (plus a grace period). Called from a review store's `mount`.

  ## Examples

      Suikou.ChangesWatcher.subscribe("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> :ok

  """
  @spec subscribe(Ecto.UUID.t()) :: :ok
  def subscribe(review_id) do
    GenServer.call(ensure_started(review_id), {:subscribe, self()})
  end

  @doc """
  Returns the review's file entries under `lens` (default `%{}` — the pinned
  `base_ref...head_ref` diff), from cache or a live `Suikou.Reviews.list_files/2`
  walk. Starts the watcher on demand; does not ref-count the caller, so a
  stateless HTTP request keeps the process alive only for the grace window.

  ## Examples

      Suikou.ChangesWatcher.list_files("0192c9f4-...")
      #=> [%{path: "docs/plan.md", content_hash: "AB12...", change_status: nil}]

  """
  @spec list_files(Ecto.UUID.t(), lens()) :: [map()]
  def list_files(review_id, lens \\ %{}) do
    GenServer.call(ensure_started(review_id), {:list_files, lens})
  end

  @doc """
  Returns how to serve `path`'s reviewed content under `lens`, from cache or a
  live `Suikou.Reviews.fetch_content_by_path/3` read. Starts the watcher on
  demand without ref-counting the caller.

  ## Examples

      Suikou.ChangesWatcher.fetch_content("0192c9f4-...", "a.txt", %{worktree: :staged})
      #=> {:ok, {:inline, "diff --git a/a.txt b/a.txt\\n...", "text/x-diff"}}

  """
  @spec fetch_content(Ecto.UUID.t(), String.t(), lens()) ::
          {:ok, content_source()} | {:error, atom()}
  def fetch_content(review_id, path, lens \\ %{}) do
    GenServer.call(ensure_started(review_id), {:fetch_content, path, lens})
  end

  @doc """
  Starts a watcher for `review_id`, named through the registry. Prefer
  `subscribe/1`, `list_files/2`, or `fetch_content/3`, which start it lazily.

  ## Examples

      Suikou.ChangesWatcher.start_link("0192c9f4-...")
      #=> {:ok, #PID<0.123.0>}

  """
  @spec start_link({Ecto.UUID.t(), [pid()]}) :: GenServer.on_start()
  def start_link({review_id, _callers} = arg) do
    GenServer.start_link(__MODULE__, arg, name: via(review_id))
  end

  @impl GenServer
  @spec init({Ecto.UUID.t(), [pid()]}) :: {:ok, map()}
  def init({review_id, callers}) do
    # Inherit the starter's `$callers` chain so this out-of-band process's Repo
    # reads resolve to the test's Ecto sandbox owner (prod-inert; no sandbox).
    Process.put(:"$callers", callers)
    # Two separate PubSub topics, both invalidate the cache: `subscribe/1` for
    # review-level changes (comment/file open-remove), `subscribe_fs/1`
    # for watched-file disk edits.
    Events.subscribe(review_id)
    Events.subscribe_fs(review_id)

    {:ok,
     %{
       review_id: review_id,
       subs: MapSet.new(),
       grace: arm_grace(),
       files: %{},
       content: %{}
     }}
  end

  @impl GenServer
  def handle_call({:subscribe, pid}, _from, state) do
    Process.monitor(pid)
    state = %{state | subs: MapSet.put(state.subs, pid), grace: cancel_grace(state.grace)}
    {:reply, :ok, state}
  end

  def handle_call({:list_files, lens}, _from, state) do
    case Map.fetch(state.files, lens) do
      {:ok, entries} ->
        {:reply, entries, state}

      :error ->
        entries = compute_files(state.review_id, lens)
        {:reply, entries, %{state | files: Map.put(state.files, lens, entries)}}
    end
  end

  def handle_call({:fetch_content, path, lens}, _from, state) do
    key = {path, lens}

    case Map.fetch(state.content, key) do
      {:ok, result} ->
        {:reply, result, state}

      :error ->
        # Cache hits only. Error results (not-found, invalid lens) are cheap to
        # recompute, and caching them would let varied bad paths grow the map
        # unbounded between invalidations.
        case compute_content(state.review_id, path, lens) do
          {:ok, _source} = result ->
            {:reply, result, %{state | content: Map.put(state.content, key, result)}}

          {:error, _reason} = result ->
            {:reply, result, state}
        end
    end
  end

  @impl GenServer
  def handle_info({:DOWN, _ref, :process, pid, _reason}, state) do
    subs = MapSet.delete(state.subs, pid)
    grace = if MapSet.size(subs) == 0, do: arm_grace(), else: state.grace
    {:noreply, %{state | subs: subs, grace: grace}}
  end

  # Grace elapsed: stop only if still no subscribers (a subscribe since arming
  # cancels the timer, so a live one here is a stale message — ignore it).
  def handle_info(:grace_timeout, state) do
    if MapSet.size(state.subs) == 0,
      do: {:stop, :normal, state},
      else: {:noreply, state}
  end

  # A review-level change or watched-file edit may reshape the list or move a
  # file's content: drop both caches and relay to subscribers. A store's
  # follow-up refetch queues behind this call, so it always reads the swept
  # cache — the relay can't race an unswept read.
  def handle_info({:review_changed, _review_id, _artifact_id} = msg, state) do
    notify(state, msg)
    {:noreply, %{state | files: %{}, content: %{}}}
  end

  def handle_info(%Events.FsChange{} = msg, state) do
    notify(state, msg)
    {:noreply, %{state | files: %{}, content: %{}}}
  end

  # Waiting-count moves no file, so relay it without dropping the caches.
  def handle_info({:waiting_changed, _review_id, _count} = msg, state) do
    notify(state, msg)
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # Fan a relayed event out to every connected store; the watcher is the review's
  # sole PubSub subscriber, so this is the stores' only change signal.
  defp notify(state, msg), do: Enum.each(state.subs, &send(&1, msg))

  defp compute_files(review_id, lens) do
    case Reviews.get_review(review_id) do
      %Review{} = review -> Reviews.list_files(review, lens)
      nil -> []
    end
  end

  defp compute_content(review_id, path, lens) do
    case Reviews.get_review(review_id) do
      %Review{} = review -> Reviews.fetch_content_by_path(review, path, lens)
      nil -> {:error, :review_not_found}
    end
  end

  defp arm_grace, do: Process.send_after(self(), :grace_timeout, @grace_ms)

  defp cancel_grace(nil), do: nil

  defp cancel_grace(ref) do
    Process.cancel_timer(ref)
    nil
  end

  # Start under the DynamicSupervisor, tolerating the start race: two callers at
  # once, the loser gets the already-started pid. Runs in the caller, so capture
  # its `$callers` chain here to seed the watcher (see init/1).
  defp ensure_started(review_id) do
    callers = [self() | Process.get(:"$callers", [])]

    spec = %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [{review_id, callers}]},
      restart: :temporary
    }

    case DynamicSupervisor.start_child(@supervisor, spec) do
      {:ok, pid} -> pid
      {:error, {:already_started, pid}} -> pid
    end
  end

  defp via(review_id), do: {:via, Registry, {@registry, review_id}}
end

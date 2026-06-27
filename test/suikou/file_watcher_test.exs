defmodule Suikou.FileWatcherTest do
  use ExUnit.Case, async: true

  alias Suikou.FileWatcher

  describe "changed_path/4" do
    test "returns the relative path for a file selection matched exactly" do
      files = MapSet.new(["lib/a.ex", "lib/b.ex"])
      assert FileWatcher.changed_path("/proj/lib/a.ex", "/proj", files, []) == "lib/a.ex"
    end

    test "returns the relative path for any file under a directory selection" do
      assert FileWatcher.changed_path("/proj/docs/new.md", "/proj", MapSet.new([]), ["docs"]) ==
               "docs/new.md"
    end

    test "returns nil for an unrelated sibling of a file selection" do
      files = MapSet.new(["lib/a.ex"])
      assert FileWatcher.changed_path("/proj/lib/c.ex", "/proj", files, []) == nil
    end

    test "returns nil for a path outside the project root" do
      files = MapSet.new(["lib/a.ex"])
      assert FileWatcher.changed_path("/etc/passwd", "/proj", files, []) == nil
    end
  end

  describe "subscribe/3 lifecycle" do
    setup do
      dir = Path.join(System.tmp_dir!(), "fw-#{System.unique_integer([:positive])}")
      File.mkdir_p!(dir)
      on_exit(fn -> File.rm_rf!(dir) end)
      review_id = "rv-#{System.unique_integer([:positive])}"
      %{dir: dir, review_id: review_id}
    end

    test "two subscribers for the same review share one watcher process", ctx do
      _s1 = start_subscriber(ctx.review_id, ctx.dir)
      _s2 = start_subscriber(ctx.review_id, ctx.dir)

      assert [{_watcher, _meta}] = Registry.lookup(Suikou.FileWatcher.Registry, ctx.review_id)
    end

    test "watcher stays alive while another subscriber remains", ctx do
      s1 = start_subscriber(ctx.review_id, ctx.dir)
      _s2 = start_subscriber(ctx.review_id, ctx.dir)
      [{watcher, _meta}] = Registry.lookup(Suikou.FileWatcher.Registry, ctx.review_id)

      stop_subscriber(s1)
      _state = :sys.get_state(watcher)

      assert Process.alive?(watcher)
      assert [{^watcher, _meta}] = Registry.lookup(Suikou.FileWatcher.Registry, ctx.review_id)
    end

    test "watcher stops when its last subscriber exits", ctx do
      s1 = start_subscriber(ctx.review_id, ctx.dir)
      [{watcher, _meta}] = Registry.lookup(Suikou.FileWatcher.Registry, ctx.review_id)
      ref = Process.monitor(watcher)

      stop_subscriber(s1)

      assert_receive {:DOWN, ^ref, :process, ^watcher, _reason}
    end
  end

  defp start_subscriber(review_id, dir) do
    test = self()

    pid =
      spawn(fn ->
        :ok = FileWatcher.subscribe(review_id, dir, [])
        send(test, :subscribed)
        receive do: (:stop -> :ok)
      end)

    assert_receive :subscribed
    pid
  end

  defp stop_subscriber(pid) do
    ref = Process.monitor(pid)
    send(pid, :stop)
    assert_receive {:DOWN, ^ref, :process, ^pid, _}
  end
end

defmodule Suikou.FileWatcherTest do
  use ExUnit.Case, async: true

  alias Suikou.FileWatcher
  alias Suikou.Schemas.Review

  @review %Review{
    id: "01a04600-0000-7000-8000-000000000000",
    project_path: "/proj",
    scratch_path: "/data/r1"
  }

  describe "changed_path/4" do
    test "returns the relative path for a file selection matched exactly" do
      files = MapSet.new(["lib/a.ex", "lib/b.ex"])
      assert FileWatcher.changed_path("/proj/lib/a.ex", @review, files, []) == "lib/a.ex"
    end

    test "returns the relative path for any file under a directory selection" do
      assert FileWatcher.changed_path("/proj/docs/new.md", @review, MapSet.new([]), ["docs"]) ==
               "docs/new.md"
    end

    test "marks a change under the scratch root so it matches its selection" do
      assert FileWatcher.changed_path("/data/r1/report.md", @review, MapSet.new([]), ["@scratch"]) ==
               "@scratch/report.md"
    end

    test "returns nil for an unrelated sibling of a file selection" do
      files = MapSet.new(["lib/a.ex"])
      assert FileWatcher.changed_path("/proj/lib/c.ex", @review, files, []) == nil
    end

    test "returns nil for a path under neither root" do
      files = MapSet.new(["lib/a.ex"])
      assert FileWatcher.changed_path("/etc/passwd", @review, files, []) == nil
    end
  end

  describe "subscribe/3 lifecycle" do
    setup do
      dir = Path.join(System.tmp_dir!(), "fw-#{System.unique_integer([:positive])}")
      File.mkdir_p!(dir)
      on_exit(fn -> File.rm_rf!(dir) end)

      review = %Review{
        id: "rv-#{System.unique_integer([:positive])}",
        project_path: dir,
        scratch_path: Path.join(dir, "scratch")
      }

      %{dir: dir, review: review, review_id: review.id}
    end

    test "two subscribers for the same review share one watcher process", ctx do
      _s1 = start_subscriber(ctx.review)
      _s2 = start_subscriber(ctx.review)

      assert [{_watcher, _meta}] = Registry.lookup(Suikou.FileWatcher.Registry, ctx.review_id)
    end

    test "watcher stays alive while another subscriber remains", ctx do
      s1 = start_subscriber(ctx.review)
      _s2 = start_subscriber(ctx.review)
      [{watcher, _meta}] = Registry.lookup(Suikou.FileWatcher.Registry, ctx.review_id)

      stop_subscriber(s1)
      _state = :sys.get_state(watcher)

      assert Process.alive?(watcher)
      assert [{^watcher, _meta}] = Registry.lookup(Suikou.FileWatcher.Registry, ctx.review_id)
    end

    test "re-subscribing with a changed selection re-points the watch", ctx do
      File.mkdir_p!(Path.join(ctx.dir, "docs"))
      _s1 = start_subscriber(ctx.review)
      [{watcher, _meta}] = Registry.lookup(Suikou.FileWatcher.Registry, ctx.review_id)
      %{ref: prior_ref} = :sys.get_state(watcher)

      _s2 = start_subscriber(ctx.review, ["docs"])

      assert %{dir_sels: ["docs"], ref: ref} = :sys.get_state(watcher)
      assert ref != prior_ref
    end

    test "re-subscribing with the same selection keeps the live watch", ctx do
      File.mkdir_p!(Path.join(ctx.dir, "docs"))
      _s1 = start_subscriber(ctx.review, ["docs"])
      [{watcher, _meta}] = Registry.lookup(Suikou.FileWatcher.Registry, ctx.review_id)
      %{ref: prior_ref} = :sys.get_state(watcher)

      _s2 = start_subscriber(ctx.review, ["docs"])

      assert %{ref: ^prior_ref} = :sys.get_state(watcher)
    end

    test "the same subscriber re-subscribing swaps the watch and is monitored once", ctx do
      File.mkdir_p!(Path.join(ctx.dir, "docs"))
      sub = start_subscriber(ctx.review)
      [{watcher, _meta}] = Registry.lookup(Suikou.FileWatcher.Registry, ctx.review_id)

      resubscribe(sub, ["docs"])

      assert %{dir_sels: ["docs"], subs: subs} = :sys.get_state(watcher)
      assert MapSet.size(subs) == 1
      assert {:monitors, [{:process, ^sub}]} = Process.info(watcher, :monitors)
    end

    test "watcher stops when its last subscriber exits", ctx do
      s1 = start_subscriber(ctx.review)
      [{watcher, _meta}] = Registry.lookup(Suikou.FileWatcher.Registry, ctx.review_id)
      ref = Process.monitor(watcher)

      stop_subscriber(s1)

      assert_receive {:DOWN, ^ref, :process, ^watcher, _reason}
    end
  end

  # Linked, so a subscriber left running is torn down with the test rather than
  # outliving it and holding its watcher alive.
  defp start_subscriber(review, selections \\ []) do
    test = self()

    pid =
      spawn_link(fn ->
        :ok = FileWatcher.subscribe(review, selections)
        send(test, :subscribed)
        subscriber_loop(review, test)
      end)

    assert_receive :subscribed
    pid
  end

  defp subscriber_loop(review, test) do
    receive do
      {:resubscribe, selections} ->
        :ok = FileWatcher.subscribe(review, selections)
        send(test, :subscribed)
        subscriber_loop(review, test)

      :stop ->
        :ok
    end
  end

  defp resubscribe(pid, selections) do
    send(pid, {:resubscribe, selections})
    assert_receive :subscribed
  end

  defp stop_subscriber(pid) do
    ref = Process.monitor(pid)
    send(pid, :stop)
    assert_receive {:DOWN, ^ref, :process, ^pid, _}
  end
end

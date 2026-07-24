defmodule Suikou.ChangesWatcherTest do
  # Lifecycle only — no Repo, so no sandbox needed. Timing uses the short grace
  # window from config/test.exs.
  use ExUnit.Case, async: false

  alias Suikou.ChangesWatcher
  alias Suikou.Events

  @registry Suikou.ChangesWatcher.Registry

  describe "event relay" do
    test "relays review and fs changes to subscribers after sweeping the cache" do
      review_id = Ecto.UUID.generate()
      # Subscribe from the test process so the relayed sends land in its mailbox.
      # It never subscribed to PubSub, so anything it receives came via the relay.
      :ok = ChangesWatcher.subscribe(review_id)

      Events.review_changed(review_id, "art-1")
      assert_receive {:review_changed, ^review_id, "art-1"}

      Events.fs_changed(review_id, "lib/a.ex", true)
      assert_receive %Events.FsChange{rel_path: "lib/a.ex", exists?: true}

      # The test process can't leave the sub set (no unsubscribe), so stop the
      # watcher to keep it from lingering past this test.
      GenServer.stop(watcher_pid(review_id))
    end
  end

  describe "ref-counted lifecycle" do
    test "stops a grace period after the last subscriber leaves, ignoring a stray timeout while subscribed" do
      review_id = Ecto.UUID.generate()
      sub = start_subscriber(review_id)
      pid = watcher_pid(review_id)
      ref = Process.monitor(pid)

      # Subscribed: a stray grace message must not stop it.
      send(pid, :grace_timeout)
      refute_receive {:DOWN, ^ref, :process, ^pid, _reason}, 50

      send(sub, :die)
      assert_receive {:DOWN, ^ref, :process, ^pid, :normal}, 1000
    end

    test "a second subscriber keeps it alive after the first leaves" do
      review_id = Ecto.UUID.generate()
      a = start_subscriber(review_id)
      b = start_subscriber(review_id)
      pid = watcher_pid(review_id)
      ref = Process.monitor(pid)

      send(a, :die)
      refute_receive {:DOWN, ^ref, :process, ^pid, _reason}, 200

      send(b, :die)
      assert_receive {:DOWN, ^ref, :process, ^pid, :normal}, 1000
    end
  end

  # Spawn a process that subscribes and then blocks until told to die, so the
  # watcher monitors a real, controllable subscriber.
  defp start_subscriber(review_id) do
    parent = self()

    sub =
      spawn(fn ->
        :ok = ChangesWatcher.subscribe(review_id)
        send(parent, :subscribed)

        receive do
          :die -> :ok
        end
      end)

    assert_receive :subscribed
    sub
  end

  defp watcher_pid(review_id) do
    [{pid, _value}] = Registry.lookup(@registry, review_id)
    pid
  end
end

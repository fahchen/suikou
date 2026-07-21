defmodule Suikou.EventsTest do
  use ExUnit.Case, async: true

  alias Suikou.Events

  describe "fs_changed/3" do
    test "broadcasts an FsChange struct to fs subscribers" do
      review_id = "rv-#{System.unique_integer([:positive])}"
      Events.subscribe_fs(review_id)

      assert :ok = Events.fs_changed(review_id, "lib/a.ex", true)

      assert_receive %Events.FsChange{review_id: ^review_id, rel_path: "lib/a.ex", exists?: true}
    end

    test "does not reach plain review subscribers" do
      review_id = "rv-#{System.unique_integer([:positive])}"
      Events.subscribe(review_id)

      assert :ok = Events.fs_changed(review_id, "lib/a.ex", true)

      refute_receive %Events.FsChange{}
    end
  end

  describe "waiter presence" do
    test "register/unregister move the count and broadcast it" do
      review_id = "rv-#{System.unique_integer([:positive])}"
      Events.subscribe(review_id)

      assert Events.waiting_count(review_id) == 0

      assert :ok = Events.register_waiting(review_id)
      assert_receive {:waiting_changed, ^review_id, 1}
      assert Events.waiting_count(review_id) == 1

      assert :ok = Events.unregister_waiting(review_id)
      assert_receive {:waiting_changed, ^review_id, 0}
      assert Events.waiting_count(review_id) == 0
    end
  end
end

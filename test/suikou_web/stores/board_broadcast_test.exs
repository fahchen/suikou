defmodule SuikouWeb.Stores.BoardBroadcastTest do
  use ExUnit.Case, async: true

  alias SuikouWeb.Stores.BoardBroadcast

  describe "subscribe/0 + broadcast/0" do
    test "a subscriber receives :board_changed after a broadcast" do
      :ok = BoardBroadcast.subscribe()
      :ok = BoardBroadcast.broadcast()

      assert_receive :board_changed
    end

    test "a process that did not subscribe receives nothing" do
      :ok = BoardBroadcast.broadcast()

      refute_receive :board_changed
    end
  end
end

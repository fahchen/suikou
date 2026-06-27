defmodule SuikouWeb.Stores.ReviewBodyStoreTest do
  use Suikou.DataCase

  alias Musubi.AsyncResult
  alias Musubi.Socket
  alias SuikouWeb.Stores.ReviewBodyStore

  describe "update disk_changed" do
    test "forwards a disk change only to the matching file child" do
      entries =
        AsyncResult.ok([
          %{path: "lib/a.ex", artifact_id: "art-1"},
          %{path: "lib/b.ex", artifact_id: nil}
        ])

      socket = %Socket{assigns: %{review_id: "rv", file_entries: entries}}

      assert {:ok, _socket} = ReviewBodyStore.update(%{disk_changed: "lib/a.ex"}, socket)

      assert_received {:musubi_send_update, ["files", "art-1"], %{disk_changed: true}}
      refute_received {:musubi_send_update, ["files", "lib/b.ex"], _assigns}
    end
  end
end

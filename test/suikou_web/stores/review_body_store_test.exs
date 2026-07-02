defmodule SuikouWeb.Stores.ReviewBodyStoreTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Musubi.AsyncResult
  alias Musubi.Socket
  alias Suikou.Repo
  alias Suikou.Reviews
  alias SuikouWeb.Stores.ReviewBodyStore

  describe "update disk_changed" do
    setup do
      tmp = Path.join(System.tmp_dir!(), "rbs-#{System.unique_integer([:positive])}")
      File.mkdir_p!(Path.join(tmp, "lib"))
      File.write!(Path.join(tmp, "lib/a.ex"), "a\n")
      on_exit(fn -> File.rm_rf!(tmp) end)

      project = insert(:project, path: tmp)
      {:ok, review} = Reviews.create_review(project, %{name: "rv", selections: ["lib/a.ex"]})
      %{review_id: Repo.preload(review, :project).id}
    end

    test "marks only the matching file child stale when it still exists", %{review_id: review_id} do
      entries =
        AsyncResult.ok([
          %{path: "lib/a.ex", artifact_id: "art-1"},
          %{path: "lib/b.ex", artifact_id: nil}
        ])

      socket = %Socket{assigns: %{review_id: review_id, file_entries: entries}}

      assert {:ok, _socket} =
               ReviewBodyStore.update(%{disk_changed: "lib/a.ex", exists: true}, socket)

      assert_received {:musubi_send_update, ["files", "art-1"], %{disk_changed: true}}
      refute_received {:musubi_send_update, ["files", "lib/b.ex"], _assigns}
    end

    test "re-derives the file list for an unknown path (a create)", %{review_id: review_id} do
      socket = %Socket{assigns: %{review_id: review_id, file_entries: AsyncResult.ok([])}}

      assert {:ok, next} =
               ReviewBodyStore.update(%{disk_changed: "lib/new.ex", exists: true}, socket)

      assert next.assigns.structure_version == 1
      refute_received {:musubi_send_update, ["files", _id], _assigns}
    end

    test "re-derives the file list when a known file is deleted", %{review_id: review_id} do
      entries = AsyncResult.ok([%{path: "lib/a.ex", artifact_id: "art-1"}])
      socket = %Socket{assigns: %{review_id: review_id, file_entries: entries}}

      assert {:ok, next} =
               ReviewBodyStore.update(%{disk_changed: "lib/a.ex", exists: false}, socket)

      assert next.assigns.structure_version == 1
      refute_received {:musubi_send_update, ["files", _id], _assigns}
    end
  end
end

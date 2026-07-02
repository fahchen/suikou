defmodule SuikouWeb.Stores.FileStoreTest do
  use Suikou.DataCase

  alias Musubi.Socket
  alias SuikouWeb.Stores.FileStore

  describe "disk_version" do
    test "is 0 in a fresh snapshot" do
      socket = %Socket{assigns: %{path: "x"}}
      assert %{disk_version: 0} = FileStore.render(socket)
    end

    test "bumps when a disk_changed update arrives" do
      {:ok, socket} =
        FileStore.update(%{disk_changed: true}, %Socket{assigns: %{path: "x", disk_version: 0}})

      assert %{disk_version: 1} = FileStore.render(socket)
    end
  end
end

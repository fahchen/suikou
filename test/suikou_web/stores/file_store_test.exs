defmodule SuikouWeb.Stores.FileStoreTest do
  use Suikou.DataCase

  alias Musubi.Socket
  alias SuikouWeb.Stores.FileStore

  describe "disk_token" do
    test "is nil when the file has no resolved absolute path" do
      socket = %Socket{assigns: %{path: "x"}}
      assert %{disk_token: nil} = FileStore.render(socket)
    end

    test "reflects the file's mtime and size when the path exists" do
      dir = tmp_dir()
      File.write!(Path.join(dir, "a.ex"), "one")

      socket = %Socket{assigns: %{path: "a.ex", abs_path: Path.join(dir, "a.ex")}}
      assert %{disk_token: token} = FileStore.render(socket)
      assert is_binary(token)

      # A disk change (new size) yields a new token, which is what marks the
      # client's open content stale.
      File.write!(Path.join(dir, "a.ex"), "one two three")
      assert %{disk_token: changed} = FileStore.render(socket)
      assert changed != token
    end

    test "a disk_changed update keeps the socket for a plain re-render" do
      socket = %Socket{assigns: %{path: "x", abs_path: nil}}
      assert {:ok, ^socket} = FileStore.update(%{disk_changed: true}, socket)
    end
  end

  defp tmp_dir do
    dir = Path.join(System.tmp_dir!(), "file_store_test_#{System.unique_integer([:positive])}")
    File.mkdir_p!(dir)
    on_exit(fn -> File.rm_rf!(dir) end)
    dir
  end
end

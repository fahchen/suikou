defmodule Suikou.CLI.AccessTest do
  use ExUnit.Case, async: false

  alias Suikou.CLI.Access

  # Each test points the data directory at its own scratch dir, so the real
  # install's credential (and the other tests' tokens) stay untouched.
  setup do
    dir = Path.join(System.tmp_dir!(), "suikou-cli-access-#{System.unique_integer([:positive])}")
    File.mkdir_p!(dir)
    original = Application.get_env(:suikou, :cli_data_dir)
    Application.put_env(:suikou, :cli_data_dir, dir)

    on_exit(fn ->
      match?({:ok, _}, File.rm_rf(dir))

      case original do
        nil -> Application.delete_env(:suikou, :cli_data_dir)
        value -> Application.put_env(:suikou, :cli_data_dir, value)
      end
    end)

    %{dir: dir}
  end

  describe "token/0" do
    test "generates a token once and persists it with mode 0600", %{dir: dir} do
      token = Access.token()

      assert is_binary(token) and token != ""

      path = Path.join(dir, "cli_token")
      assert File.read!(path) == token
      assert mode(path) == 0o600
    end

    test "returns the persisted token on the next call" do
      assert Access.token() == Access.token()
    end

    test "generates a fresh token after the operator deletes the file" do
      first = Access.token()
      File.rm!(Path.join(Access.data_dir(), "cli_token"))

      second = Access.token()

      assert second != first
      assert second == Access.token()
    end
  end

  describe "write_access/1 and fetch/0" do
    test "round-trips the port and the current token with mode 0600", %{dir: dir} do
      :ok = Access.write_access(47_100)

      assert {:ok, %{port: 47_100, token: token}} = Access.fetch()
      assert token == Access.token()
      assert mode(Path.join(dir, "cli.json")) == 0o600
    end

    test "answers :error when no access file exists yet" do
      assert Access.fetch() == :error
    end

    test "answers :error for a malformed file", %{dir: dir} do
      File.write!(Path.join(dir, "cli.json"), "not json")

      assert Access.fetch() == :error
    end

    test "answers :error for a well-formed file with out-of-range values", %{dir: dir} do
      File.write!(Path.join(dir, "cli.json"), Jason.encode!(%{port: 70_000, token: "x"}))

      assert Access.fetch() == :error
    end

    test "answers {:error, reason} rather than raising for an unwritable directory" do
      # The data directory resolves to a path under a regular file, so the
      # directory cannot be created and the write must fail cleanly.
      file =
        Path.join(
          System.tmp_dir!(),
          "suikou-cli-access-file-#{System.unique_integer([:positive])}"
        )

      File.write!(file, "x")
      on_exit(fn -> File.rm(file) end)
      Application.put_env(:suikou, :cli_data_dir, Path.join(file, "nested"))

      assert {:error, _reason} = Access.write_access(47_100)
    end
  end

  defp mode(path) do
    Bitwise.band(File.stat!(path).mode, 0o777)
  end
end

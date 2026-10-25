defmodule Suikou.CLI.Access do
  @moduledoc """
  The loopback access credential shared by the server and the CLI.

  The CLI reaches the server over HTTP on `127.0.0.1` only, so a caller must
  prove it may drive this install: the server writes the port it listens on and
  a secret token into `cli.json` in the data directory at boot, and every CLI
  request presents the token as a Bearer credential (see
  `SuikouWeb.CLITokenPlug`). The file has mode 0600 and the data directory
  belongs to the user, so another local user can neither read the token nor
  call the server.

  The token itself is stable across boots (generated once into `cli_token`), so
  a CLI call that races a server restart still authenticates; only the port can
  change between boots, and `cli.json` is rewritten with it.

  ## Examples

      Suikou.CLI.Access.fetch()
      #=> {:ok, %{port: 47100, token: "9f2c…"}}
  """

  @access_file "cli.json"
  @token_file "cli_token"

  @typedoc "The port and token the server last wrote at boot."
  @type access() :: %{port: pos_integer(), token: String.t()}

  @doc """
  The per-user data directory the server and the CLI share.

  Test and dev point it elsewhere through `config :suikou, :cli_data_dir` or
  the `SUIKOU_DATA_DIR` environment variable, so a dev server never overwrites
  the packaged install's credential.
  """
  @spec data_dir() :: Path.t()
  def data_dir do
    Application.get_env(:suikou, :cli_data_dir) || System.get_env("SUIKOU_DATA_DIR") ||
      Path.join([System.user_home!(), "Library", "Application Support", "Suikou"])
  end

  @doc """
  Reads the port and token the server wrote at boot, or `:error` when the file
  is absent, unreadable, or malformed. The CLI reads this on every call, so a
  restart that picked a new port is picked up without a restart of the caller.
  """
  @spec fetch() :: {:ok, access()} | :error
  def fetch do
    with {:ok, raw} <- File.read(access_path()),
         {:ok, %{"port" => port, "token" => token}} <- Jason.decode(raw),
         true <- is_integer(port) and port in 1..65_535,
         true <- is_binary(token) and token != "" do
      {:ok, %{port: port, token: token}}
    else
      _invalid -> :error
    end
  end

  @doc """
  Writes the port and the current token into `cli.json` with mode 0600.

  The server calls this at boot once its port is bound, so the CLI can find it.
  Returns `{:error, reason}` rather than raising: a CLI-only boot (the server
  not started) never writes the file, and a failed write must not crash a
  server that is otherwise up — the server logs it and the CLI reports that
  Suikou is not running.
  """
  @spec write_access(pos_integer()) :: :ok | {:error, term()}
  def write_access(port) when is_integer(port) and port in 1..65_535 do
    path = access_path()

    with :ok <- File.mkdir_p(Path.dirname(path)),
         :ok <- File.write(path, Jason.encode!(%{port: port, token: token()})) do
      File.chmod(path, 0o600)
    end
  end

  @doc """
  The server's CLI token: the bytes of `cli_token`, generated on first read.

  Reading rather than keeping the token in memory keeps every verification
  against the file the operator can rotate by deleting it.
  """
  @spec token() :: String.t()
  def token do
    path = token_path()

    case File.read(path) do
      {:ok, existing} when byte_size(existing) > 0 ->
        String.trim(existing)

      _unreadable ->
        generated = Base.encode16(:crypto.strong_rand_bytes(32), case: :lower)

        with :ok <- File.mkdir_p(Path.dirname(path)),
             :ok <- File.write(path, generated),
             :ok <- File.chmod(path, 0o600) do
          generated
        else
          # A token we could not persist still authenticates this boot's
          # requests; the next boot generates a fresh one.
          {:error, _reason} -> generated
        end
    end
  end

  defp access_path, do: Path.join(data_dir(), @access_file)

  defp token_path, do: Path.join(data_dir(), @token_file)
end

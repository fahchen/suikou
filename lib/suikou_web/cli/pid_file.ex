defmodule SuikouWeb.CLI.PidFile do
  @moduledoc """
  The pid file of the serving node: `suikou.pid` in the data directory.

  A boot that serves writes its OS pid there right after the endpoint starts,
  next to the CLI access file (see `SuikouWeb.CLI.Access`), so the server can
  answer a moment before the file exists; a clean stop removes it before the
  endpoint closes. The file is for the operator and for process tools; the CLI
  itself asks the server for its pid over the loopback API.

  ## Examples

      SuikouWeb.CLI.PidFile.write()
      #=> :ok

  """

  alias SuikouWeb.CLI.Access

  @pid_file "suikou.pid"

  @doc """
  Writes the OS pid of this node, with a trailing newline, into the pid file.

  Returns `{:error, reason}` rather than raising: a failed write must not
  crash a server that is otherwise up.
  """
  @spec write() :: :ok | {:error, File.posix()}
  def write do
    path = path()

    with :ok <- File.mkdir_p(Path.dirname(path)) do
      File.write(path, [:os.getpid(), ?\n])
    end
  end

  @doc """
  Removes the pid file when it holds the OS pid of this node.

  A CLI boot stops through the same application callback as the server, so
  the check keeps it from removing the pid file of the server it talked to.
  """
  @spec remove() :: :ok
  def remove do
    path = path()

    with {:ok, contents} <- File.read(path),
         true <- String.trim(contents) == List.to_string(:os.getpid()) do
      _removed = File.rm(path)
    end

    :ok
  end

  defp path, do: Path.join(Access.data_dir(), @pid_file)
end

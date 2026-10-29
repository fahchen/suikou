defmodule SuikouWeb.AgentCLI.Server do
  @moduledoc """
  Agent CLI commands for the top-level `suikou` app itself: report where the
  running server is reachable, report its OS pid, and stop it. Each takes its
  JSON payload and returns the JSON result map (see `SuikouWeb.AgentCLI`).
  """

  alias SuikouWeb.AgentCLI
  alias SuikouWeb.Endpoint

  @doc """
  Returns the board root URL as `%{url, error}`.

  Uses the endpoint's configured canonical URL (`Endpoint.url/0`), so it follows
  whatever `:url` host/scheme the deployment sets.

  ## Examples

      SuikouWeb.AgentCLI.Server.url(%{})
      #=> %{url: "https://suikou.example", error: nil}

  """
  @spec url(AgentCLI.payload()) :: AgentCLI.result()
  def url(_payload) do
    %{url: Endpoint.url(), error: nil}
  end

  @doc """
  Returns the server's OS pid as `%{pid}`. The CLI reads it to tell a live
  daemon from a dead one without a shell-out.

  ## Examples

      SuikouWeb.AgentCLI.Server.pid(%{})
      #=> %{pid: "12345", error: nil}

  """
  @spec pid(AgentCLI.payload()) :: AgentCLI.result()
  def pid(_payload) do
    %{pid: List.to_string(:os.getpid()), error: nil}
  end

  @doc """
  Stops the server gracefully and returns `%{error}`.

  The stop is scheduled a beat after the reply so the response flushes before
  the node begins draining — the CLI then waits for the port to close, as
  `suikou stop` always did. `System.stop/0` lets each supervisor shut down in
  order, the same graceful drain a release `stop` command performs.

  ## Examples

      SuikouWeb.AgentCLI.Server.stop(%{})
      #=> %{error: nil}

  """
  @spec stop(AgentCLI.payload()) :: AgentCLI.result()
  def stop(_payload) do
    Task.start(fn ->
      Process.sleep(500)
      System.stop()
    end)

    %{error: nil}
  end
end

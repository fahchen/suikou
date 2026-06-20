defmodule SuikouWeb.AgentCLI.Server do
  @moduledoc """
  Agent CLI commands for the top-level `suikou` app itself: report where the
  running server is reachable. Reads its JSON payload from stdin and emits a JSON
  result to stdout (see `SuikouWeb.AgentCLI`).
  """

  alias SuikouWeb.AgentCLI
  alias SuikouWeb.Endpoint

  @doc """
  Builds the running server's **local** base URL, e.g. `"http://localhost:4317"`.

  Mirrors the launcher's `urlForPort`: `http`, host from `PHX_HOST` (default
  `localhost`), and the endpoint's bound HTTP port — not `Endpoint.url/0`, whose
  runtime config points at the public `https` host.

  ## Examples

      SuikouWeb.AgentCLI.Server.base_url()
      #=> "http://localhost:4317"

  """
  @spec base_url() :: String.t()
  def base_url do
    port = Keyword.fetch!(Endpoint.config(:http), :port)
    host = System.get_env("PHX_HOST", "localhost")
    "http://#{host}:#{port}"
  end

  @doc """
  Emits the board root URL as `%{url, error}`.

  ## Examples

      SuikouWeb.AgentCLI.Server.url()
      #=> :ok  # emits {"url":"http://localhost:4317","error":null}

  """
  @spec url() :: :ok
  def url do
    _payload = AgentCLI.read_payload()
    AgentCLI.emit(%{url: base_url(), error: nil})
  end
end

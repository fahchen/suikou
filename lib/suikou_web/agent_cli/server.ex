defmodule SuikouWeb.AgentCLI.Server do
  @moduledoc """
  Agent CLI commands for the top-level `suikou` app itself: report where the
  running server is reachable. Reads its JSON payload from stdin and emits a JSON
  result to stdout (see `SuikouWeb.AgentCLI`).
  """

  alias SuikouWeb.AgentCLI
  alias SuikouWeb.Endpoint

  @doc """
  Emits the board root URL as `%{url, error}`.

  Uses the endpoint's configured canonical URL (`Endpoint.url/0`), so it follows
  whatever `:url` host/scheme the deployment sets.

  ## Examples

      SuikouWeb.AgentCLI.Server.url()
      #=> :ok  # emits {"url":"https://suikou.example","error":null}

  """
  @spec url() :: :ok
  def url do
    _payload = AgentCLI.read_payload()
    AgentCLI.emit(%{url: Endpoint.url(), error: nil})
  end
end

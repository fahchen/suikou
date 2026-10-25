defmodule SuikouWeb.CLI.ServerController do
  @moduledoc """
  Loopback CLI API routes for the top-level app: where the board lives, the
  OS pid, and the graceful stop. Each action passes the request body to its
  `SuikouWeb.AgentCLI.Server` command and sends the result map as JSON (see
  `SuikouWeb.CLI`).
  """

  use SuikouWeb, :controller

  alias SuikouWeb.AgentCLI
  alias SuikouWeb.CLI

  @doc false
  @spec url(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def url(conn, _params), do: json(conn, AgentCLI.Server.url(CLI.payload(conn)))

  @doc false
  @spec pid(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def pid(conn, _params), do: json(conn, AgentCLI.Server.pid(CLI.payload(conn)))

  @doc false
  @spec stop(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def stop(conn, _params), do: json(conn, AgentCLI.Server.stop(CLI.payload(conn)))
end

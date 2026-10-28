defmodule SuikouWeb.CLI.ProjectController do
  @moduledoc """
  Loopback CLI API routes for the `project` group. Each action passes the
  request body to its `SuikouWeb.AgentCLI.Projects` command and sends the
  result map as JSON (see `SuikouWeb.CLI.Payload`).
  """

  use SuikouWeb, :controller

  alias SuikouWeb.AgentCLI
  alias SuikouWeb.CLI.Payload

  @doc false
  @spec list(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def list(conn, _params), do: json(conn, AgentCLI.Projects.list(Payload.payload(conn)))

  @doc false
  @spec create(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def create(conn, _params), do: json(conn, AgentCLI.Projects.create(Payload.payload(conn)))
end

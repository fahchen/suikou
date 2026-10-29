defmodule SuikouWeb.CLI.ReplyController do
  @moduledoc """
  Loopback CLI API routes for the `reply` group. Each action passes the
  request body to its `SuikouWeb.AgentCLI.Replies` command and sends the
  result map as JSON (see `SuikouWeb.CLI.Payload`).
  """

  use SuikouWeb, :controller

  alias SuikouWeb.AgentCLI
  alias SuikouWeb.CLI.Payload

  @doc false
  @spec react(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def react(conn, _params), do: json(conn, AgentCLI.Replies.react(Payload.payload(conn)))

  @doc false
  @spec unreact(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def unreact(conn, _params), do: json(conn, AgentCLI.Replies.unreact(Payload.payload(conn)))
end

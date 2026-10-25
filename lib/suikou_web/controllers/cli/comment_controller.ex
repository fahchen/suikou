defmodule SuikouWeb.CLI.CommentController do
  @moduledoc """
  Loopback CLI API routes for the `comment` group. Each action passes the
  request body to its `SuikouWeb.AgentCLI.Comments` command and sends the
  result map as JSON (see `SuikouWeb.CLI`).
  """

  use SuikouWeb, :controller

  alias SuikouWeb.AgentCLI
  alias SuikouWeb.CLI

  @doc false
  @spec add(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def add(conn, _params), do: json(conn, AgentCLI.Comments.add(CLI.payload(conn)))

  @doc false
  @spec reply(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def reply(conn, _params), do: json(conn, AgentCLI.Comments.reply(CLI.payload(conn)))

  @doc false
  @spec resolve(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def resolve(conn, _params), do: json(conn, AgentCLI.Comments.resolve(CLI.payload(conn)))

  @doc false
  @spec reopen(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def reopen(conn, _params), do: json(conn, AgentCLI.Comments.reopen(CLI.payload(conn)))

  @doc false
  @spec react(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def react(conn, _params), do: json(conn, AgentCLI.Comments.react(CLI.payload(conn)))

  @doc false
  @spec unreact(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def unreact(conn, _params), do: json(conn, AgentCLI.Comments.unreact(CLI.payload(conn)))
end

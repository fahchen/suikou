defmodule SuikouWeb.CLI.ReviewController do
  @moduledoc """
  Loopback CLI API routes for the `review` group. Each action passes the
  request body to its `SuikouWeb.AgentCLI.Reviews` command and sends the
  result map as JSON (see `SuikouWeb.CLI.Payload`). `wait` blocks for its poll window
  inside the request process, so no route-level timeout applies.
  """

  use SuikouWeb, :controller

  alias SuikouWeb.AgentCLI
  alias SuikouWeb.CLI.Payload

  @doc false
  @spec list(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def list(conn, _params), do: json(conn, AgentCLI.Reviews.list(Payload.payload(conn)))

  @doc false
  @spec create(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def create(conn, _params), do: json(conn, AgentCLI.Reviews.create(Payload.payload(conn)))

  @doc false
  @spec show(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def show(conn, _params), do: json(conn, AgentCLI.Reviews.show(Payload.payload(conn)))

  @doc false
  @spec files(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def files(conn, _params), do: json(conn, AgentCLI.Reviews.files(Payload.payload(conn)))

  @doc false
  @spec url(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def url(conn, _params), do: json(conn, AgentCLI.Reviews.url(Payload.payload(conn)))

  @doc false
  @spec rename(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def rename(conn, _params), do: json(conn, AgentCLI.Reviews.rename(Payload.payload(conn)))

  @doc false
  @spec set_files(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def set_files(conn, _params), do: json(conn, AgentCLI.Reviews.set_files(Payload.payload(conn)))

  @doc false
  @spec set_stack(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def set_stack(conn, _params), do: json(conn, AgentCLI.Reviews.set_stack(Payload.payload(conn)))

  @doc false
  @spec add_files(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def add_files(conn, _params), do: json(conn, AgentCLI.Reviews.add_files(Payload.payload(conn)))

  @doc false
  @spec remove_files(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def remove_files(conn, _params),
    do: json(conn, AgentCLI.Reviews.remove_files(Payload.payload(conn)))

  @doc false
  @spec delete(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def delete(conn, _params), do: json(conn, AgentCLI.Reviews.delete(Payload.payload(conn)))

  @doc false
  @spec export(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def export(conn, _params), do: json(conn, AgentCLI.Reviews.export(Payload.payload(conn)))

  @doc false
  @spec wait(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def wait(conn, _params), do: json(conn, AgentCLI.Reviews.wait(Payload.payload(conn)))

  @doc false
  @spec notify(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def notify(conn, _params), do: json(conn, AgentCLI.Reviews.notify(Payload.payload(conn)))
end

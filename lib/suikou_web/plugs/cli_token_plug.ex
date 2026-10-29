defmodule SuikouWeb.CLITokenPlug do
  @moduledoc """
  Gates the loopback CLI API: only a caller holding this install's CLI token
  passes (see `SuikouWeb.CLI.Access`). The token travels as a Bearer credential,
  compared in constant time. A request without it, or with the wrong one,
  answers `401` with `%{error: "unauthorized"}` so the CLI can surface the
  refusal instead of a parse error.
  """

  @behaviour Plug

  import Plug.Conn

  alias Phoenix.Controller
  alias SuikouWeb.CLI.Access

  @impl Plug
  def init(options), do: options

  @impl Plug
  def call(conn, _options) do
    if authorized?(conn) do
      conn
    else
      conn
      |> put_status(:unauthorized)
      |> Controller.json(%{error: "unauthorized"})
      |> halt()
    end
  end

  defp authorized?(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> presented] -> Plug.Crypto.secure_compare(presented, Access.token())
      _else -> false
    end
  end
end

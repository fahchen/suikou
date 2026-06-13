defmodule SuikouWeb.SpaController do
  @moduledoc """
  Serves the React single-page-app shell (`priv/static/index.html`) for browser
  routes that aren't API or static-asset requests. The client-side router
  (TanStack Router) takes over from there, so a refresh or deep link on any
  client route returns the same shell instead of a 404.
  """

  use SuikouWeb, :controller

  @doc """
  Sends the SPA shell `priv/static/index.html` for client routes; returns 404 for
  requests under a reserved prefix (`/api` or a static root). A missing asset or an
  unknown API path then fails honestly instead of returning HTML with a 200 — the
  SPA shell is only ever served for genuine browser routes.

  ## Examples

      get(conn, "/review/0192...")
      #=> 200, text/html

      get(conn, "/assets/missing.js")
      #=> 404

      get(conn, "/api/unknown")
      #=> 404

  """
  @spec index(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def index(conn, _params) do
    if reserved_path?(conn) do
      send_resp(conn, 404, "")
    else
      conn
      |> put_resp_content_type("text/html")
      |> send_file(200, Application.app_dir(:suikou, "priv/static/index.html"))
    end
  end

  defp reserved_path?(conn) do
    case conn.path_info do
      [first | _rest] -> first == "api" or first in SuikouWeb.static_paths()
      [] -> false
    end
  end
end

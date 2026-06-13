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
  requests under a static root. A missing asset then fails honestly instead of
  returning HTML with a 200 — the SPA shell is only ever served for genuine browser
  routes. When the shell hasn't been built yet (e.g. a fresh checkout), responds 500
  with a build hint instead of crashing on the missing file.

  ## Examples

      get(conn, "/review/0192...")
      #=> 200, text/html

      get(conn, "/assets/missing.js")
      #=> 404

  """
  @spec index(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def index(conn, _params) do
    shell = Application.app_dir(:suikou, "priv/static/index.html")

    cond do
      reserved_path?(conn) ->
        send_resp(conn, 404, "")

      File.exists?(shell) ->
        conn
        |> put_resp_content_type("text/html")
        |> send_file(200, shell)

      true ->
        conn
        |> put_resp_content_type("text/plain")
        |> send_resp(
          500,
          "SPA shell not built. Run `mix suikou.package`, or `bun run build` in assets/."
        )
    end
  end

  @doc """
  Returns 404 for any unmatched `/api` path. Routed under the `:asset` pipeline so a
  JSON client gets a 404 instead of the 406 the `:browser` pipeline's `plug :accepts`
  would raise on an `application/json` Accept header.

  ## Examples

      get(conn, "/api/unknown")
      #=> 404

  """
  @spec not_found(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def not_found(conn, _params) do
    send_resp(conn, 404, "")
  end

  defp reserved_path?(conn) do
    case conn.path_info do
      [first | _rest] -> first in SuikouWeb.static_paths()
      [] -> false
    end
  end
end

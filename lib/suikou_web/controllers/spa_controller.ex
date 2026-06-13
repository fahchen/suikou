defmodule SuikouWeb.SpaController do
  @moduledoc """
  Serves the React single-page-app shell (`priv/static/index.html`) for browser
  routes that aren't API or static-asset requests. The client-side router
  (TanStack Router) takes over from there, so a refresh or deep link on any
  client route returns the same shell instead of a 404.
  """

  use SuikouWeb, :controller

  @doc """
  Sends the SPA shell `priv/static/index.html`.

  ## Examples

      get(conn, "/review/0192...")
      #=> 200, text/html

  """
  @spec index(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def index(conn, _params) do
    conn
    |> put_resp_content_type("text/html")
    |> send_file(200, Application.app_dir(:suikou, "priv/static/index.html"))
  end
end

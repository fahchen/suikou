defmodule SuikouWeb.SpaControllerTest do
  # async: false — these tests create/remove the shared priv/static/index.html.
  use SuikouWeb.ConnCase, async: false

  @shell Application.app_dir(:suikou, "priv/static/index.html")

  describe "SPA fallback" do
    setup [:ensure_shell]

    test "serves the shell at the root", %{conn: conn} do
      conn = get(conn, "/")

      assert html_response(conn, 200)
    end

    test "serves the shell for a client deep link", %{conn: conn} do
      conn = get(conn, "/review/0192abcd")

      assert html_response(conn, 200)
    end

    test "404s a missing static asset instead of returning the shell", %{conn: conn} do
      conn = get(conn, "/assets/missing.js")

      assert response(conn, 404) == ""
    end

    test "404s an unknown API path instead of returning the shell", %{conn: conn} do
      conn = get(conn, "/api/unknown")

      assert response(conn, 404) == ""
    end
  end

  describe "when the shell has not been built" do
    setup [:remove_shell]

    test "500s with a build hint instead of crashing", %{conn: conn} do
      conn = get(conn, "/")

      assert response(conn, 500) =~ "not built"
    end
  end

  defp ensure_shell(_context) do
    if File.exists?(@shell) do
      :ok
    else
      File.mkdir_p!(Path.dirname(@shell))
      File.write!(@shell, ~s(<!doctype html><div id="root"></div>))
      on_exit(fn -> File.rm(@shell) end)
    end

    :ok
  end

  defp remove_shell(_context) do
    backup = @shell <> ".bak"

    if File.exists?(@shell) do
      File.rename!(@shell, backup)
      on_exit(fn -> File.rename!(backup, @shell) end)
    end

    :ok
  end
end

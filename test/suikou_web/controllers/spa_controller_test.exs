defmodule SuikouWeb.SpaControllerTest do
  use SuikouWeb.ConnCase, async: true

  describe "SPA fallback" do
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

  setup do
    index = Application.app_dir(:suikou, "priv/static/index.html")

    created? =
      unless File.exists?(index) do
        File.mkdir_p!(Path.dirname(index))
        File.write!(index, ~s(<!doctype html><div id="suikou-spa-test-shell"></div>))
        true
      end

    on_exit(fn -> if created?, do: File.rm(index) end)
    :ok
  end
end

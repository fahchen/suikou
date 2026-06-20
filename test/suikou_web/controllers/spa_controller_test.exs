defmodule SuikouWeb.SpaControllerTest do
  # async: false — these tests create/remove the shared priv/static/index.html.
  use SuikouWeb.ConnCase, async: false

  @shell Application.app_dir(:suikou, "priv/static/index.html")

  describe "SPA fallback" do
    setup [:ensure_shell]

    test "serves the shell at the root", %{conn: conn} do
      conn = get(conn, "/")

      response = html_response(conn, 200)
      assert response
      refute response =~ "suikou:debug"
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

  describe "debug overlay enabled" do
    setup [:debug_shell]

    test "injects the debug meta into the served shell", %{conn: conn} do
      conn = get(conn, "/")

      assert html_response(conn, 200) =~ ~s(<meta name="suikou:debug" content="true">)
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

  defp debug_shell(_context) do
    # :suikou, :debug scoped to this async: false module and reverted on exit;
    # no sibling reads it concurrently.
    Application.put_env(:suikou, :debug, true)
    on_exit(fn -> Application.delete_env(:suikou, :debug) end)

    backup = @shell <> ".bak"

    if File.exists?(@shell) do
      File.rm(backup)
      File.rename!(@shell, backup)
      on_exit(fn -> File.rename!(backup, @shell) end)
    else
      on_exit(fn -> File.rm(@shell) end)
    end

    File.mkdir_p!(Path.dirname(@shell))
    File.write!(@shell, ~s(<!doctype html><head></head><body><div id="root"></div></body>))

    :ok
  end

  defp remove_shell(_context) do
    backup = @shell <> ".bak"

    if File.exists?(@shell) do
      # Clear any leftover backup from an interrupted run so the rename can't clash.
      File.rm(backup)
      File.rename!(@shell, backup)
      on_exit(fn -> File.rename!(backup, @shell) end)
    end

    :ok
  end
end

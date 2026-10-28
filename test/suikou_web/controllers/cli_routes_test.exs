defmodule SuikouWeb.CLIRoutesTest do
  @moduledoc """
  Drives the loopback CLI API through the endpoint: the token gate, and one
  route per group proving the request body reaches the same `AgentCLI` command
  the rpc transport used to call, with the same JSON result.
  """

  use SuikouWeb.ConnCase

  import Suikou.Factory

  alias SuikouWeb.CLI.Access

  describe "the :cli pipeline" do
    test "rejects a request without a token" do
      conn = post_json(build_conn(), "/api/cli/project/list", %{})

      assert json_response(conn, 401) == %{"error" => "unauthorized"}
    end

    test "rejects a request with the wrong token" do
      conn =
        build_conn()
        |> put_req_header("authorization", "Bearer not-the-token")
        |> post_json("/api/cli/project/list", %{})

      assert json_response(conn, 401) == %{"error" => "unauthorized"}
    end
  end

  describe "project routes" do
    test "list answers with the same JSON the command returns" do
      insert(:project, name: "Docs")

      conn = post_json(authorized(), "/api/cli/project/list", %{})

      assert %{"projects" => [%{"name" => "Docs", "instructions" => []}]} =
               json_response(conn, 200)
    end
  end

  describe "review routes" do
    test "show answers with the command's not-found error" do
      conn =
        post_json(authorized(), "/api/cli/review/show", %{"review_id" => Ecto.UUID.generate()})

      assert %{"error" => "review_not_found"} = json_response(conn, 200)
    end
  end

  describe "server routes" do
    test "pid answers with the OS pid" do
      conn = post_json(authorized(), "/api/cli/server/pid", %{})

      assert %{"pid" => pid, "error" => nil} = json_response(conn, 200)
      assert pid == List.to_string(:os.getpid())
    end
  end

  defp authorized(conn \\ build_conn()) do
    put_req_header(conn, "authorization", "Bearer " <> Access.token())
  end

  defp post_json(conn, path, payload) do
    conn
    |> put_req_header("content-type", "application/json")
    |> post(path, Jason.encode!(payload))
  end
end

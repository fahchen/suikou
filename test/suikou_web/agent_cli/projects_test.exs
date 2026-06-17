defmodule SuikouWeb.AgentCLI.ProjectsTest do
  use Suikou.DataCase

  import ExUnit.CaptureIO
  import Suikou.Factory

  alias SuikouWeb.AgentCLI.Projects
  alias SuikouWeb.Stores.BoardBroadcast

  describe "list/0" do
    test "emits every registered project" do
      project = insert(:project, name: "Docs")

      assert %{"projects" => [%{"id" => id, "name" => "Docs", "path" => _path}]} =
               run(%{}, &Projects.list/0)

      assert id == project.id
    end
  end

  describe "create/0" do
    @tag :tmp_dir
    test "registers a project, broadcasts the board, and emits its id", %{tmp_dir: dir} do
      :ok = BoardBroadcast.subscribe()

      assert %{"project_id" => id, "error" => nil} =
               run(%{"name" => "Docs", "path" => dir}, &Projects.create/0)

      assert is_binary(id)
      assert_receive :board_changed
    end

    test "emits an error for a non-directory path" do
      assert %{"project_id" => nil, "error" => "not_a_directory"} =
               run(%{"name" => "Docs", "path" => "/nope/missing"}, &Projects.create/0)
    end
  end

  defp run(payload, fun) do
    [input: Jason.encode!(payload)]
    |> capture_io(fun)
    |> Jason.decode!()
  end
end

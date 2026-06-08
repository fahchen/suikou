defmodule Suikou.Artifacts.FileSourceTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Artifacts
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Round

  describe "create_from_file/2" do
    @tag :tmp_dir
    test "creates an artifact at round 0 from the file on disk", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\nbody\n")
      project = insert(:project, path: dir)

      assert {:ok, %{artifact: %Artifact{} = artifact, round: %Round{} = round}} =
               Artifacts.create_from_file(project, "plan.md")

      assert %Artifact{title: "plan.md", file_path: "plan.md", project_id: project_id} = artifact
      assert project_id == project.id
      assert %Round{number: 0, content: "# Plan\nbody\n"} = round
    end

    @tag :tmp_dir
    test "rejects an empty file", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "blank.md"), "   \n")
      project = insert(:project, path: dir)

      assert {:error, :empty_content} = Artifacts.create_from_file(project, "blank.md")
    end

    @tag :tmp_dir
    test "rejects a missing file", %{tmp_dir: dir} do
      project = insert(:project, path: dir)

      assert {:error, :not_a_file} = Artifacts.create_from_file(project, "nope.md")
    end

    @tag :tmp_dir
    test "rejects a path escaping the project", %{tmp_dir: dir} do
      project = insert(:project, path: dir)

      assert {:error, :unsafe_path} = Artifacts.create_from_file(project, "../escape.md")
    end
  end
end

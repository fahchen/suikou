defmodule SuikouWeb.Stores.ProjectBoardStoreTest do
  use Suikou.DataCase

  alias Musubi.Testing
  alias Suikou.Projects
  alias SuikouWeb.Stores.ProjectBoardStore

  describe "render/1" do
    @tag :tmp_dir
    test "lists each project with its candidate markdown files", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "notes.md"), "# Notes\n")
      {:ok, _project} = Projects.register_project(%{name: "Docs", path: dir})

      page = Testing.mount(ProjectBoardStore)

      assert %{projects: [%{name: "Docs", files: files}]} = Testing.render(page)
      assert Enum.map(files, & &1.path) == ["notes.md", "plan.md"]
      assert Enum.all?(files, &is_nil(&1.artifact_id))
    end

    @tag :tmp_dir
    test "renders an empty list when no project is registered", %{tmp_dir: _dir} do
      page = Testing.mount(ProjectBoardStore)
      assert %{projects: []} = Testing.render(page)
    end
  end

  describe "create_artifact" do
    @tag :tmp_dir
    test "mints an artifact from a file and links it on the next render", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\nbody\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})

      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{artifact_id: artifact_id, error: nil}} =
               Testing.dispatch_command(page, :create_artifact, %{
                 project_id: project.id,
                 file_path: "plan.md"
               })

      assert is_binary(artifact_id)

      assert %{projects: [%{files: [%{path: "plan.md", artifact_id: ^artifact_id}]}]} =
               Testing.render(page)
    end

    @tag :tmp_dir
    test "an empty file mints no artifact and replies with an error", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "blank.md"), "   \n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})

      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{artifact_id: nil, error: "empty_content"}} =
               Testing.dispatch_command(page, :create_artifact, %{
                 project_id: project.id,
                 file_path: "blank.md"
               })

      assert %{projects: [%{files: [%{artifact_id: nil}]}]} = Testing.render(page)
    end

    test "an unknown project replies with an error" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{artifact_id: nil, error: "project_not_found"}} =
               Testing.dispatch_command(page, :create_artifact, %{
                 project_id: "00000000-0000-7000-8000-000000000000",
                 file_path: "plan.md"
               })
    end
  end
end

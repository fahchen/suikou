defmodule Suikou.ProjectsTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Projects
  alias Suikou.Schemas.Project

  describe "register_project/1" do
    @tag :tmp_dir
    test "registers an existing directory, storing an absolute path", %{tmp_dir: dir} do
      assert {:ok, %Project{name: "Docs"} = project} =
               Projects.register_project(%{name: "Docs", path: dir})

      assert project.path == Path.expand(dir)
    end

    test "rejects a path that is not a directory" do
      assert {:error, :not_a_directory} =
               Projects.register_project(%{name: "Docs", path: "/no/such/dir/here"})
    end

    test "rejects a blank name" do
      assert {:error, %Ecto.Changeset{}} =
               Projects.register_project(%{name: "  ", path: "/tmp"})
    end

    @tag :tmp_dir
    test "rejects a duplicate path", %{tmp_dir: dir} do
      {:ok, _project} = Projects.register_project(%{name: "A", path: dir})

      assert {:error, %Ecto.Changeset{}} =
               Projects.register_project(%{name: "B", path: dir})
    end
  end

  describe "list_projects/0" do
    test "returns projects ordered by name" do
      insert(:project, name: "Zed")
      insert(:project, name: "Alpha")

      assert ["Alpha", "Zed"] = Enum.map(Projects.list_projects(), & &1.name)
    end
  end

  describe "list_files/1" do
    @tag :tmp_dir
    test "lists every file type relative to the project, sorted", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "readme.md"), "# readme\n")
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join(dir, "docs/plan.md"), "# plan\n")
      File.write!(Path.join(dir, "notes.txt"), "plain text\n")

      project = build(:project, path: dir)

      assert ["docs/plan.md", "notes.txt", "readme.md"] = Projects.list_files(project)
    end

    @tag :tmp_dir
    test "skips files matched by a .gitignore at the project root", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "readme.md"), "# readme\n")
      File.mkdir_p!(Path.join(dir, "node_modules/pkg"))
      File.write!(Path.join(dir, "node_modules/pkg/dep.md"), "# vendored\n")
      File.write!(Path.join(dir, "draft.tmp.md"), "# scratch\n")
      File.write!(Path.join(dir, ".gitignore"), "node_modules/\n*.tmp.md\n")

      project = build(:project, path: dir)

      assert [".gitignore", "readme.md"] = Projects.list_files(project)
    end

    @tag :tmp_dir
    test "re-includes a path a later negation rule un-ignores", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "keep.md"), "# keep\n")
      File.write!(Path.join(dir, "scratch.md"), "# scratch\n")
      File.write!(Path.join(dir, ".gitignore"), "*.md\n!keep.md\n")

      project = build(:project, path: dir)

      assert [".gitignore", "keep.md"] = Projects.list_files(project)
    end
  end
end

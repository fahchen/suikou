defmodule Suikou.ProjectsTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Projects
  alias Suikou.Repo
  alias Suikou.Reviews
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Reply
  alias Suikou.Schemas.Round

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

  describe "delete_project/1" do
    @tag :tmp_dir
    test "deletes the project and cascades reviews, artifacts, rounds, comments, and replies",
         %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\nbody\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})
      {:ok, artifact} = Reviews.open_file(review, "plan.md")
      round = Repo.get_by!(Round, artifact_id: artifact.id, number: 0)
      comment = published_comment(round.id, %{body: "Needs a fix"})
      {:ok, reply} = Critique.reply_as_human(comment.id, "On it")

      assert {:ok, %Project{id: project_id}} = Projects.delete_project(project.id)
      assert project_id == project.id
      assert is_nil(Projects.get_project(project.id))
      assert is_nil(Reviews.get_review(review.id))
      assert is_nil(Repo.get(Artifact, artifact.id))
      assert is_nil(Repo.get(Round, round.id))
      assert is_nil(Repo.get(Comment, comment.id))
      assert is_nil(Repo.get(Reply, reply.id))
    end

    test "returns an error when the project does not exist" do
      assert {:error, :project_not_found} =
               Projects.delete_project("00000000-0000-7000-8000-000000000000")
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
    test "lists gitignored files when respect_gitignore is false", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "readme.md"), "# readme\n")
      File.mkdir_p!(Path.join(dir, "node_modules/pkg"))
      File.write!(Path.join(dir, "node_modules/pkg/dep.md"), "# vendored\n")
      File.write!(Path.join(dir, ".gitignore"), "node_modules/\n")

      project = build(:project, path: dir, respect_gitignore: false)

      assert [".gitignore", "node_modules/pkg/dep.md", "readme.md"] =
               Projects.list_files(project)
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

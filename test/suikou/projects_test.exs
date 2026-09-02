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
  alias Suikou.Schemas.Settings

  describe "register_project/1" do
    @tag :tmp_dir
    test "resolves the given directory to a repository identity", %{tmp_dir: dir} do
      init_repo(dir, "git@github.com:fahchen/example.git")

      assert {:ok, %Project{name: "Docs", identity: "github.com/fahchen/example"}} =
               Projects.register_project(%{name: "Docs", path: dir})
    end

    test "registers a board with no directory and no identity" do
      assert {:ok, %Project{name: "Docs", identity: nil}} =
               Projects.register_project(%{name: "Docs"})
    end

    test "rejects a path that is not a directory" do
      assert {:error, :not_a_directory} =
               Projects.register_project(%{name: "Docs", path: "/no/such/dir/here"})
    end

    test "rejects a blank name" do
      assert {:error, %Ecto.Changeset{}} = Projects.register_project(%{name: "  "})
    end

    test "rejects a directory that is not a repository" do
      # Outside the project tree: a directory *inside* one answers that
      # repository's identity, which is the behaviour this guards, not breaks.
      dir = Path.join(System.tmp_dir!(), "loose-#{System.unique_integer([:positive])}")
      File.mkdir_p!(dir)
      on_exit(fn -> File.rm_rf!(dir) end)

      assert {:error, :not_a_repository} =
               Projects.register_project(%{name: "Loose", path: dir})
    end

    @tag :tmp_dir
    test "rejects a second project for the same repository", %{tmp_dir: dir} do
      init_repo(dir, "git@github.com:fahchen/example.git")
      {:ok, _project} = Projects.register_project(%{name: "A", path: dir})

      assert {:error, %Ecto.Changeset{}} =
               Projects.register_project(%{name: "B", path: dir})
    end

    test "allows any number of boards with no identity" do
      {:ok, _a} = Projects.register_project(%{name: "A"})

      assert {:ok, %Project{}} = Projects.register_project(%{name: "B"})
    end
  end

  describe "get_project_by_dir/1" do
    @tag :tmp_dir
    test "finds the project grouping a worktree of the same repository", %{tmp_dir: dir} do
      init_repo(dir, "https://github.com/fahchen/example.git")
      {:ok, project} = Projects.register_project(%{name: "Example", path: dir})

      assert %Project{id: id} = Projects.get_project_by_dir(dir)
      assert id == project.id
    end

    @tag :tmp_dir
    test "claims a project that predates identity from one of its own reviews",
         %{tmp_dir: dir} do
      init_repo(dir, "git@github.com:fahchen/example.git")
      {:ok, project} = Projects.register_project(%{name: "Legacy"})

      {:ok, _review} =
        Reviews.create_review(project, %{name: "Old", project_path: dir, selections: ["."]})

      assert %Project{id: id, identity: "github.com/fahchen/example"} =
               Projects.get_project_by_dir(dir)

      assert id == project.id
      assert %Project{identity: "github.com/fahchen/example"} = Projects.get_project(project.id)
    end

    @tag :tmp_dir
    test "does not claim a project that never reviewed this checkout", %{tmp_dir: dir} do
      init_repo(dir, "git@github.com:fahchen/example.git")
      {:ok, _project} = Projects.register_project(%{name: "Unrelated"})

      assert Projects.get_project_by_dir(dir) == nil
    end

    @tag :tmp_dir
    test "answers nil for a directory that is not a repository", %{tmp_dir: dir} do
      assert Projects.get_project_by_dir(dir) == nil
    end
  end

  describe "list_projects/0" do
    test "returns projects ordered by name" do
      insert(:project, name: "Zed")
      insert(:project, name: "Alpha")

      assert ["Alpha", "Zed"] = Enum.map(Projects.list_projects(), & &1.name)
    end
  end

  describe "update_project/2" do
    test "stores review instructions and blanks them back out" do
      project = insert(:project)

      assert {:ok, %Project{review_instructions: "Reply in English."} = updated} =
               Projects.update_project(project, %{review_instructions: " Reply in English. "})

      assert {:ok, %Project{review_instructions: nil}} =
               Projects.update_project(updated, %{review_instructions: "   "})
    end

    test "rejects review instructions past the ceiling" do
      too_long = String.duplicate("x", Settings.max_instructions() + 1)

      assert {:error, %Ecto.Changeset{errors: [review_instructions: _error]}} =
               Projects.update_project(insert(:project), %{review_instructions: too_long})
    end
  end

  describe "delete_project/1" do
    @tag :tmp_dir
    test "deletes the project and cascades reviews, artifacts, rounds, comments, and replies",
         %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\nbody\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})

      {:ok, review} =
        Reviews.create_review(project, %{
          project_path: dir,
          name: "Launch",
          selections: ["plan.md"]
        })

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

  describe "list_files/3" do
    @tag :tmp_dir
    test "lists every file type relative to the project, sorted", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "readme.md"), "# readme\n")
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join(dir, "docs/plan.md"), "# plan\n")
      File.write!(Path.join(dir, "notes.txt"), "plain text\n")

      assert ["docs/plan.md", "notes.txt", "readme.md"] = Projects.list_files(dir, true)
    end

    @tag :tmp_dir
    test "skips files matched by a .gitignore at the project root", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "readme.md"), "# readme\n")
      File.mkdir_p!(Path.join(dir, "node_modules/pkg"))
      File.write!(Path.join(dir, "node_modules/pkg/dep.md"), "# vendored\n")
      File.write!(Path.join(dir, "draft.tmp.md"), "# scratch\n")
      File.write!(Path.join(dir, ".gitignore"), "node_modules/\n*.tmp.md\n")

      assert [".gitignore", "readme.md"] = Projects.list_files(dir, true)
    end

    @tag :tmp_dir
    test "lists gitignored files when respect_gitignore is false", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "readme.md"), "# readme\n")
      File.mkdir_p!(Path.join(dir, "node_modules/pkg"))
      File.write!(Path.join(dir, "node_modules/pkg/dep.md"), "# vendored\n")
      File.write!(Path.join(dir, ".gitignore"), "node_modules/\n")

      assert [".gitignore", "node_modules/pkg/dep.md", "readme.md"] =
               Projects.list_files(dir, false)
    end

    @tag :tmp_dir
    test "re-includes a path a later negation rule un-ignores", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "keep.md"), "# keep\n")
      File.write!(Path.join(dir, "scratch.md"), "# scratch\n")
      File.write!(Path.join(dir, ".gitignore"), "*.md\n!keep.md\n")

      assert [".gitignore", "keep.md"] = Projects.list_files(dir, true)
    end

    @tag :tmp_dir
    test "never exposes .git contents even when respect_gitignore is false", %{tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, ".git"))
      File.write!(Path.join(dir, ".git/config"), "[core]\n")

      assert [] = Projects.list_files(dir, false, ".git")
      assert [] = Projects.list_dir(dir, false, ".git")
    end
  end

  # A real repository, since identity is resolved by shelling out to git.
  defp init_repo(dir, origin) do
    {_out, 0} = System.cmd("git", ["init", "-q"], cd: dir, stderr_to_stdout: true)
    {_out, 0} = System.cmd("git", ["remote", "add", "origin", origin], cd: dir)
    :ok
  end
end

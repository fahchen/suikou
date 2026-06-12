defmodule SuikouWeb.Stores.ProjectBoardStoreTest do
  use Suikou.DataCase

  alias Musubi.Testing
  alias Suikou.Projects
  alias Suikou.Reviews
  alias SuikouWeb.Stores.ProjectBoardStore

  describe "render/1" do
    @tag :tmp_dir
    test "lists each registered project with no reviews yet", %{tmp_dir: dir} do
      {:ok, _project} = Projects.register_project(%{name: "Docs", path: dir})

      page = Testing.mount(ProjectBoardStore)

      assert %{projects: [%{name: "Docs", reviews: []}]} = Testing.render(page)
    end

    @tag :tmp_dir
    test "renders a project's reviews with their selected files", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, _review} = Reviews.create_review(project, %{name: "Launch", file_paths: ["plan.md"]})

      page = Testing.mount(ProjectBoardStore)

      assert %{projects: [%{reviews: [%{name: "Launch", files: [file]}]}]} = Testing.render(page)
      assert %{path: "plan.md", approved: false} = file
      assert is_binary(file.artifact_id)
    end

    test "renders an empty list when no project is registered" do
      page = Testing.mount(ProjectBoardStore)
      assert %{projects: []} = Testing.render(page)
    end
  end

  describe "create_project" do
    @tag :tmp_dir
    test "registers a directory and lists it on the next render", %{tmp_dir: dir} do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{project_id: project_id, error: nil}} =
               Testing.dispatch_command(page, :create_project, %{name: "Docs", path: dir})

      assert is_binary(project_id)

      assert %{projects: [%{id: ^project_id, name: "Docs"}]} = Testing.render(page)
    end

    test "a path that is not a directory replies with an error" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{project_id: nil, error: "not_a_directory"}} =
               Testing.dispatch_command(page, :create_project, %{
                 name: "Docs",
                 path: "/no/such/dir"
               })

      assert %{projects: []} = Testing.render(page)
    end

    @tag :tmp_dir
    test "a blank name replies with an error", %{tmp_dir: dir} do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{project_id: nil, error: error}} =
               Testing.dispatch_command(page, :create_project, %{name: "  ", path: dir})

      assert error =~ "name"
      assert %{projects: []} = Testing.render(page)
    end

    @tag :tmp_dir
    test "a duplicate path replies with an error", %{tmp_dir: dir} do
      {:ok, _project} = Projects.register_project(%{name: "First", path: dir})
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{project_id: nil, error: error}} =
               Testing.dispatch_command(page, :create_project, %{name: "Second", path: dir})

      assert error =~ "path"
    end
  end

  describe "delete_review" do
    @tag :tmp_dir
    test "removes the review from the next render", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\nbody\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", file_paths: ["plan.md"]})

      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{error: nil}} =
               Testing.dispatch_command(page, :delete_review, %{review_id: review.id})

      assert %{projects: [%{reviews: []}]} = Testing.render(page)
    end

    test "an unknown review replies with an error" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{error: "review_not_found"}} =
               Testing.dispatch_command(page, :delete_review, %{
                 review_id: "00000000-0000-7000-8000-000000000000"
               })
    end
  end

  describe "rename_review" do
    @tag :tmp_dir
    test "renames the review on the next render", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\nbody\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", file_paths: ["plan.md"]})

      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{error: nil}} =
               Testing.dispatch_command(page, :rename_review, %{
                 review_id: review.id,
                 name: "Spec pass"
               })

      assert %{projects: [%{reviews: [%{name: "Spec pass"}]}]} = Testing.render(page)
    end

    test "an unknown review replies with an error" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{error: "review_not_found"}} =
               Testing.dispatch_command(page, :rename_review, %{
                 review_id: "00000000-0000-7000-8000-000000000000",
                 name: "Spec pass"
               })
    end
  end

  describe "list_project_files" do
    @tag :tmp_dir
    test "replies with the project's candidate files, sorted", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "notes.md"), "# Notes\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})

      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{files: ["notes.md", "plan.md"]}} =
               Testing.dispatch_command(page, :list_project_files, %{project_id: project.id})
    end

    test "an unknown project replies with no files" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{files: []}} =
               Testing.dispatch_command(page, :list_project_files, %{
                 project_id: "00000000-0000-7000-8000-000000000000"
               })
    end
  end

  describe "create_review" do
    @tag :tmp_dir
    test "mints a review from selected files and lists it on the next render", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\nbody\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\nbody\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})

      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{review_id: review_id, error: nil}} =
               Testing.dispatch_command(page, :create_review, %{
                 project_id: project.id,
                 name: "Launch",
                 file_paths: ["plan.md", "spec.md"]
               })

      assert is_binary(review_id)

      assert %{projects: [%{reviews: [%{id: ^review_id, files: files}]}]} = Testing.render(page)
      assert Enum.map(files, & &1.path) == ["plan.md", "spec.md"]
    end

    @tag :tmp_dir
    test "an empty selection replies with an error", %{tmp_dir: dir} do
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{review_id: nil, error: "no_files"}} =
               Testing.dispatch_command(page, :create_review, %{
                 project_id: project.id,
                 name: "Launch",
                 file_paths: []
               })
    end

    @tag :tmp_dir
    test "an unreadable file rolls back and replies with an error", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "blank.md"), "   \n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{review_id: nil, error: error}} =
               Testing.dispatch_command(page, :create_review, %{
                 project_id: project.id,
                 name: "Launch",
                 file_paths: ["blank.md"]
               })

      assert error =~ "empty_content"
      assert %{projects: [%{reviews: []}]} = Testing.render(page)
    end

    test "an unknown project replies with an error" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{review_id: nil, error: "project_not_found"}} =
               Testing.dispatch_command(page, :create_review, %{
                 project_id: "00000000-0000-7000-8000-000000000000",
                 name: "Launch",
                 file_paths: ["plan.md"]
               })
    end
  end

  describe "update_review_files" do
    @tag :tmp_dir
    test "reconciles a review's selection on the next render", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\nbody\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\nbody\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", file_paths: ["plan.md"]})

      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{error: nil}} =
               Testing.dispatch_command(page, :update_review_files, %{
                 review_id: review.id,
                 file_paths: ["spec.md"]
               })

      assert %{projects: [%{reviews: [%{files: [%{path: "spec.md"}]}]}]} = Testing.render(page)
    end

    test "an unknown review replies with an error" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{error: "review_not_found"}} =
               Testing.dispatch_command(page, :update_review_files, %{
                 review_id: "00000000-0000-7000-8000-000000000000",
                 file_paths: ["plan.md"]
               })
    end
  end
end

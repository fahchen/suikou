defmodule SuikouWeb.Stores.ProjectBoardStoreTest do
  use Suikou.DataCase

  alias Musubi.AsyncResult
  alias Musubi.Testing
  alias Suikou.Projects
  alias Suikou.Reviews
  alias SuikouWeb.Stores.BoardBroadcast
  alias SuikouWeb.Stores.ProjectBoardStore

  describe ":board_changed reactivity" do
    @tag :tmp_dir
    test "a board broadcast pushes a patch reflecting a review created elsewhere", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})

      page = Testing.mount(ProjectBoardStore)
      await_review_files(page)
      flush_patches()

      # Simulates a write on another connection (e.g. a CLI `review create`):
      # the open board was never dirtied by its own command, so only the
      # broadcast can refresh it.
      {:ok, _review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})
      :ok = BoardBroadcast.broadcast()

      # The field stays `:ok` (stale) and swaps in place once the recompute
      # resolves, so wait for the result to carry the new review rather than for
      # a loading→ok flip (which no longer happens with `start_async`).
      snapshot = await_review_files_where(page, &(&1 != []))

      assert %{projects: [%{reviews: [%{name: "Launch"}]}]} = snapshot
      assert %AsyncResult{status: :ok, result: [%{review_id: _review_id}]} = snapshot.review_files
    end
  end

  describe "render/1" do
    @tag :tmp_dir
    test "lists each registered project with no reviews yet", %{tmp_dir: dir} do
      {:ok, _project} = Projects.register_project(%{name: "Docs", path: dir})

      page = Testing.mount(ProjectBoardStore)

      assert %{projects: [%{name: "Docs", reviews: []}]} = Testing.render(page)
    end

    @tag :tmp_dir
    test "renders a project's reviews with their selection (no disk walk)", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, _review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

      page = Testing.mount(ProjectBoardStore)

      assert %{
               projects: [
                 %{
                   reviews: [
                     %{name: "Launch", kind: :file_selection, selections: ["plan.md"]}
                   ]
                 }
               ]
             } =
               Testing.render(page)
    end

    test "renders an empty list when no project is registered" do
      page = Testing.mount(ProjectBoardStore)
      assert %{projects: []} = Testing.render(page)
    end

    @tag :tmp_dir
    test "exposes a git-diff review's base/head refs and current commit SHAs on the card",
         %{tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "x\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "topic"])
      {:ok, project} = Projects.register_project(%{name: "Repo", path: dir})

      {:ok, _review} =
        Reviews.create_diff_review(project, %{
          name: "Topic",
          base_ref: "main",
          head_ref: "topic"
        })

      page = Testing.mount(ProjectBoardStore)

      assert %{
               projects: [
                 %{
                   reviews: [
                     %{
                       kind: :git_diff,
                       selections: [],
                       base_ref: "main",
                       head_ref: "topic",
                       base_sha: base_sha,
                       head_sha: head_sha,
                       creation_base_sha: creation_base_sha,
                       creation_head_sha: creation_head_sha,
                       refs_moved: false
                     }
                   ]
                 }
               ]
             } = Testing.render(page)

      assert is_binary(base_sha)
      assert is_binary(head_sha)
      assert byte_size(base_sha) == 40
      assert byte_size(head_sha) == 40
      refute base_sha == head_sha
      # Just created: creation SHAs match current resolution.
      assert creation_base_sha == base_sha
      assert creation_head_sha == head_sha
    end

    @tag :tmp_dir
    test "git-diff card flags refs_moved once a pinned ref advances",
         %{tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "x\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "topic v1"])
      {:ok, project} = Projects.register_project(%{name: "Repo", path: dir})

      {:ok, _review} =
        Reviews.create_diff_review(project, %{
          name: "Topic",
          base_ref: "main",
          head_ref: "topic"
        })

      page = Testing.mount(ProjectBoardStore)

      %{projects: [%{reviews: [%{refs_moved: false, creation_head_sha: pinned_head}]}]} =
        Testing.render(page)

      assert is_binary(pinned_head)

      File.write!(Path.join(dir, "a.txt"), "y\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "topic v2"])

      %{
        projects: [
          %{
            reviews: [
              %{
                refs_moved: true,
                head_sha: current_head,
                creation_head_sha: ^pinned_head
              }
            ]
          }
        ]
      } = Testing.render(page)

      refute current_head == pinned_head
    end

    @tag :tmp_dir
    test "git-diff card refs_moved stays false when a ref vanishes",
         %{tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "x\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "topic"])
      {:ok, project} = Projects.register_project(%{name: "Repo", path: dir})

      {:ok, _review} =
        Reviews.create_diff_review(project, %{
          name: "Topic",
          base_ref: "main",
          head_ref: "topic"
        })

      git!(dir, ["checkout", "-q", "main"])
      git!(dir, ["branch", "-q", "-D", "topic"])

      page = Testing.mount(ProjectBoardStore)

      assert %{
               projects: [
                 %{
                   reviews: [
                     %{
                       kind: :git_diff,
                       head_sha: nil,
                       creation_head_sha: creation_head,
                       refs_moved: false
                     }
                   ]
                 }
               ]
             } = Testing.render(page)

      # The pinned creation SHA is still there; only the current resolution
      # vanished. The reviewer must not be told the ref "moved".
      assert is_binary(creation_head)
    end

    @tag :tmp_dir
    test "git-diff card head_sha follows the head ref when it advances",
         %{tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "x\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "topic v1"])
      {:ok, project} = Projects.register_project(%{name: "Repo", path: dir})

      {:ok, _review} =
        Reviews.create_diff_review(project, %{
          name: "Topic",
          base_ref: "main",
          head_ref: "topic"
        })

      page = Testing.mount(ProjectBoardStore)
      %{projects: [%{reviews: [%{head_sha: before_sha}]}]} = Testing.render(page)

      File.write!(Path.join(dir, "a.txt"), "y\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "topic v2"])

      # render/1 re-resolves the ref on each call, so the second snapshot
      # reflects the advanced branch without re-mounting.
      %{projects: [%{reviews: [%{head_sha: after_sha}]}]} = Testing.render(page)

      assert is_binary(before_sha)
      assert is_binary(after_sha)
      refute before_sha == after_sha
    end

    @tag :tmp_dir
    test "git-diff card SHAs are nil when a ref no longer resolves",
         %{tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "x\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "topic"])
      {:ok, project} = Projects.register_project(%{name: "Repo", path: dir})

      {:ok, _review} =
        Reviews.create_diff_review(project, %{
          name: "Topic",
          base_ref: "main",
          head_ref: "topic"
        })

      # Branch ref disappears (e.g. deleted upstream). Card render must not
      # blow up; SHA fields stay null.
      git!(dir, ["checkout", "-q", "main"])
      git!(dir, ["branch", "-q", "-D", "topic"])

      page = Testing.mount(ProjectBoardStore)

      assert %{
               projects: [
                 %{
                   reviews: [
                     %{
                       kind: :git_diff,
                       base_ref: "main",
                       head_ref: "topic",
                       base_sha: base_sha,
                       head_sha: nil
                     }
                   ]
                 }
               ]
             } = Testing.render(page)

      assert is_binary(base_sha)
    end

    @tag :tmp_dir
    test "file-selection card carries nil SHA fields", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, _review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

      page = Testing.mount(ProjectBoardStore)

      assert %{
               projects: [
                 %{
                   reviews: [
                     %{
                       kind: :file_selection,
                       base_sha: nil,
                       head_sha: nil
                     }
                   ]
                 }
               ]
             } = Testing.render(page)
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

    @tag :tmp_dir
    test "persists respect_gitignore from the payload", %{tmp_dir: dir} do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{project_id: project_id, error: nil}} =
               Testing.dispatch_command(page, :create_project, %{
                 name: "Docs",
                 path: dir,
                 respect_gitignore: false
               })

      assert %{respect_gitignore: false} = Projects.get_project(project_id)
      assert %{projects: [%{respect_gitignore: false}]} = Testing.render(page)
    end

    @tag :tmp_dir
    test "defaults respect_gitignore to true when the payload omits it", %{tmp_dir: dir} do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{project_id: project_id, error: nil}} =
               Testing.dispatch_command(page, :create_project, %{
                 name: "Docs",
                 path: dir,
                 respect_gitignore: nil
               })

      assert %{respect_gitignore: true} = Projects.get_project(project_id)
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

  describe "update_project" do
    @tag :tmp_dir
    test "flips respect_gitignore and surfaces it on the next render", %{tmp_dir: dir} do
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      page = Testing.mount(ProjectBoardStore)

      assert %{projects: [%{respect_gitignore: true}]} = Testing.render(page)

      assert {:ok, %{error: nil}} =
               Testing.dispatch_command(page, :update_project, %{
                 project_id: project.id,
                 respect_gitignore: false
               })

      assert %{respect_gitignore: false} = Projects.get_project(project.id)
      assert %{projects: [%{respect_gitignore: false}]} = Testing.render(page)
    end

    test "an unknown project replies with an error" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{error: "project_not_found"}} =
               Testing.dispatch_command(page, :update_project, %{
                 project_id: "00000000-0000-7000-8000-000000000000",
                 respect_gitignore: false
               })
    end
  end

  describe "delete_review" do
    @tag :tmp_dir
    test "removes the review from the next render", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\nbody\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

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

  describe "delete_project" do
    @tag :tmp_dir
    test "removes the project from the next render", %{tmp_dir: dir} do
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{error: nil}} =
               Testing.dispatch_command(page, :delete_project, %{project_id: project.id})

      assert %{projects: []} = Testing.render(page)
    end

    test "an unknown project replies with an error" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{error: "project_not_found"}} =
               Testing.dispatch_command(page, :delete_project, %{
                 project_id: "00000000-0000-7000-8000-000000000000"
               })
    end
  end

  describe "rename_review" do
    @tag :tmp_dir
    test "renames the review on the next render", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\nbody\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

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

  describe "list_dir" do
    @tag :tmp_dir
    test "replies with one level of entries, directories first", %{tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join([dir, "docs", "plan.md"]), "# Plan\n")
      File.write!(Path.join(dir, "notes.md"), "# Notes\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})

      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{entries: [%{path: "docs", dir: true}, %{path: "notes.md", dir: false}]}} =
               Testing.dispatch_command(page, :list_dir, %{project_id: project.id, path: ""})
    end

    @tag :tmp_dir
    test "lists a subdirectory's immediate children", %{tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join([dir, "docs", "plan.md"]), "# Plan\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})

      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{entries: [%{path: "docs/plan.md", dir: false}]}} =
               Testing.dispatch_command(page, :list_dir, %{project_id: project.id, path: "docs"})
    end

    test "an unknown project replies with no entries" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{entries: []}} =
               Testing.dispatch_command(page, :list_dir, %{
                 project_id: "00000000-0000-7000-8000-000000000000",
                 path: ""
               })
    end
  end

  describe "list_branches" do
    @tag :tmp_dir
    test "replies with the project's real branches and resolved default", %{tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "x\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "topic"])

      {:ok, project} = Projects.register_project(%{name: "Repo", path: dir})
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{branches: branches, remote_branches: [], default: "main", error: nil}} =
               Testing.dispatch_command(page, :list_branches, %{project_id: project.id})

      assert Enum.sort(branches) == ["main", "topic"]
    end

    @tag :tmp_dir
    test "errors when the project path is not a git repo", %{tmp_dir: dir} do
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      page = Testing.mount(ProjectBoardStore)

      assert {:ok,
              %{
                branches: [],
                remote_branches: [],
                default: nil,
                error: "not_a_git_repo"
              }} =
               Testing.dispatch_command(page, :list_branches, %{project_id: project.id})
    end

    test "errors when the project id is unknown" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok,
              %{
                branches: [],
                remote_branches: [],
                default: nil,
                error: "project_not_found"
              }} =
               Testing.dispatch_command(page, :list_branches, %{
                 project_id: "00000000-0000-7000-8000-000000000000"
               })
    end
  end

  describe "create_review" do
    @tag :tmp_dir
    test "stores a review's selection and lists it on the next render", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\nbody\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\nbody\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})

      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{review_id: review_id, error: nil}} =
               Testing.dispatch_command(page, :create_review, %{
                 project_id: project.id,
                 name: "Launch",
                 selections: ["plan.md", "spec.md"]
               })

      assert is_binary(review_id)

      assert %{projects: [%{reviews: [%{id: ^review_id, selections: ["plan.md", "spec.md"]}]}]} =
               Testing.render(page)
    end

    @tag :tmp_dir
    test "an empty selection replies with an error", %{tmp_dir: dir} do
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{review_id: nil, error: "no_files"}} =
               Testing.dispatch_command(page, :create_review, %{
                 project_id: project.id,
                 name: "Launch",
                 selections: []
               })
    end

    @tag :tmp_dir
    test "an unreadable selected file still creates the review (validated on open)", %{
      tmp_dir: dir
    } do
      File.write!(Path.join(dir, "blank.md"), "   \n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{review_id: review_id, error: nil}} =
               Testing.dispatch_command(page, :create_review, %{
                 project_id: project.id,
                 name: "Launch",
                 selections: ["blank.md"]
               })

      assert is_binary(review_id)
    end

    test "an unknown project replies with an error" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{review_id: nil, error: "project_not_found"}} =
               Testing.dispatch_command(page, :create_review, %{
                 project_id: "00000000-0000-7000-8000-000000000000",
                 name: "Launch",
                 selections: ["plan.md"]
               })
    end
  end

  describe "update_review_files" do
    @tag :tmp_dir
    test "reconciles a review's selection on the next render", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\nbody\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\nbody\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{error: nil}} =
               Testing.dispatch_command(page, :update_review_files, %{
                 review_id: review.id,
                 selections: ["spec.md"]
               })

      assert %{projects: [%{reviews: [%{selections: ["spec.md"]}]}]} = Testing.render(page)
    end

    test "an unknown review replies with an error" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{error: "review_not_found"}} =
               Testing.dispatch_command(page, :update_review_files, %{
                 review_id: "00000000-0000-7000-8000-000000000000",
                 selections: ["plan.md"]
               })
    end
  end

  describe "load_board" do
    @tag :tmp_dir
    test "replies with projects and grouped review files", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, reply} = Testing.dispatch_command(page, :load_board, %{})

      assert %{projects: [%{name: "Docs", reviews: [%{id: review_id, name: "Launch"}]}]} = reply
      assert review_id == review.id
      assert [%{review_id: ^review_id, files: [%{path: "plan.md"}]}] = reply.review_files
    end

    test "replies with empty lists when nothing is registered" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{projects: [], review_files: []}} =
               Testing.dispatch_command(page, :load_board, %{})
    end
  end

  describe "list_review_files" do
    @tag :tmp_dir
    test "replies with the expanded files and their minted state", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{files: [%{path: "plan.md", artifact_id: nil, approved: false}], error: nil}} =
               Testing.dispatch_command(page, :list_review_files, %{review_id: review.id})
    end

    test "an unknown review replies with an error" do
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{files: [], error: "review_not_found"}} =
               Testing.dispatch_command(page, :list_review_files, %{
                 review_id: "00000000-0000-7000-8000-000000000000"
               })
    end
  end

  describe "open_review_file" do
    @tag :tmp_dir
    test "mints/returns the artifact id for a covered file", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{artifact_id: id, error: nil}} =
               Testing.dispatch_command(page, :open_review_file, %{
                 review_id: review.id,
                 path: "plan.md"
               })

      assert is_binary(id)
    end

    @tag :tmp_dir
    test "rejects a path not covered by the selection", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})
      {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})
      page = Testing.mount(ProjectBoardStore)

      assert {:ok, %{artifact_id: nil, error: "not_covered"}} =
               Testing.dispatch_command(page, :open_review_file, %{
                 review_id: review.id,
                 path: "other.md"
               })
    end
  end

  defp flush_patches do
    receive do
      {:patch, _envelope} -> flush_patches()
    after
      0 -> :ok
    end
  end

  # Re-renders until the async `review_files` resolves. Each render peeks the
  # page via a synchronous call, so when the resolution patch lands the next
  # render observes `:ok`; the wait both isolates the board-changed push and
  # lets the recompute task finish before the sandbox connection is reclaimed.
  defp await_review_files(page) do
    snapshot = Testing.render(page)

    case snapshot.review_files do
      %AsyncResult{status: :ok} ->
        snapshot

      %AsyncResult{} ->
        assert_receive {:patch, _envelope}
        await_review_files(page)
    end
  end

  # Re-renders until `review_files` resolves to a value satisfying `pred`. For
  # refreshes the field stays `:ok` and swaps in place, so a status check alone
  # cannot tell the new result from the stale one — gate on the value instead.
  defp await_review_files_where(page, pred) do
    snapshot = Testing.render(page)

    case snapshot.review_files do
      %AsyncResult{status: :ok, result: result} ->
        if pred.(result) do
          snapshot
        else
          assert_receive {:patch, _envelope}
          await_review_files_where(page, pred)
        end

      %AsyncResult{} ->
        assert_receive {:patch, _envelope}
        await_review_files_where(page, pred)
    end
  end

  defp init_repo!(dir) do
    File.mkdir_p!(dir)
    git!(dir, ["init", "-q", "-b", "main", "."])
    File.write!(Path.join(dir, "seed.txt"), "seed\n")
    git!(dir, ["add", "."])
    git!(dir, ["commit", "-q", "-m", "seed"])
  end

  defp git!(dir, args) do
    env = [
      {"GIT_AUTHOR_NAME", "Test"},
      {"GIT_AUTHOR_EMAIL", "test@example.com"},
      {"GIT_COMMITTER_NAME", "Test"},
      {"GIT_COMMITTER_EMAIL", "test@example.com"},
      {"GIT_CONFIG_GLOBAL", "/dev/null"},
      {"GIT_CONFIG_SYSTEM", "/dev/null"}
    ]

    case System.cmd("git", args, cd: dir, env: env, stderr_to_stdout: true) do
      {_out, 0} -> :ok
      {out, code} -> raise "git #{Enum.join(args, " ")} failed (#{code}): #{out}"
    end
  end
end

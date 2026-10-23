defmodule Suikou.ReviewsStackTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.ChangesWatcher
  alias Suikou.Repo
  alias Suikou.Reviews
  alias Suikou.Schemas.ReviewSource.GitDiff
  alias Suikou.Schemas.Round

  @moduletag :tmp_dir

  setup :stacked_repo

  describe "create_diff_review/2 with a stack" do
    test "attaches a stack that carries exactly the source change", %{dir: dir, project: project} do
      assert {:ok, review} = create(project, dir, "feat-review")

      assert %GitDiff{base_ref: "main", head_ref: "feat", stack_ref: "feat-review"} =
               review.source
    end

    test "leaves the stack empty when none is given", %{dir: dir, project: project} do
      assert {:ok, review} = create(project, dir, nil)
      assert %GitDiff{stack_ref: nil} = review.source
    end

    test "rejects a stack ref that does not resolve", %{dir: dir, project: project} do
      assert {:error, :stack_ref_not_found} = create(project, dir, "missing")
    end

    test "rejects a stack that drops changes, listing the differing paths",
         %{dir: dir, project: project} do
      branch_from!(dir, "partial", "main", [{"a.txt", "a\n"}])

      assert {:error, {:stack_not_equivalent, ["b.txt"]}} = create(project, dir, "partial")
    end

    test "rejects a stack cut from a different merge-base", %{dir: dir, project: project} do
      commit_on!(dir, "main", [{"c.txt", "c\n"}])
      branch_from!(dir, "rebased", "main", [{"a.txt", "a\n"}, {"b.txt", "b\n"}])

      assert {:error, :stack_base_mismatch} = create(project, dir, "rebased")
    end
  end

  describe "set_stack/2" do
    setup :diff_review

    test "attaches an equivalent stack, keeping rounds", %{review: review} do
      round = round_in_review(review)

      assert {:ok, updated} = Reviews.set_stack(review, "feat-review")

      assert %GitDiff{base_ref: "main", head_ref: "feat", stack_ref: "feat-review"} =
               updated.source

      assert %Round{} = Repo.get(Round, round.id)
    end

    test "persists the stack", %{review: review} do
      {:ok, _review} = Reviews.set_stack(review, "feat-review")

      assert %{source: %GitDiff{stack_ref: "feat-review"}} = Reviews.get_review(review.id)
    end

    test "rejects a stack that adds changes, listing the differing paths",
         %{dir: dir, review: review} do
      branch_from!(dir, "extra", "feat", [{"d.txt", "d\n"}])

      assert {:error, {:stack_not_equivalent, ["d.txt"]}} = Reviews.set_stack(review, "extra")
    end

    test "rejects a stack ref that does not resolve", %{review: review} do
      assert {:error, :stack_ref_not_found} = Reviews.set_stack(review, "missing")
    end

    test "rejects a file-selection review" do
      assert {:error, :not_a_diff_review} = Reviews.set_stack(insert(:review), "feat-review")
    end
  end

  describe "refs_snapshot/1 with a stack" do
    setup :stacked_review

    test "reports an in-sync stack", %{review: review} do
      assert %{stack_ref: "feat-review", refs_valid: true, stack_valid: true, stack_in_sync: true} =
               Reviews.refs_snapshot(review)
    end

    test "reports the stack out of sync once the source moves", %{dir: dir, review: review} do
      commit_on!(dir, "feat", [{"fix.txt", "fix\n"}])

      assert %{refs_valid: true, stack_in_sync: false} = Reviews.refs_snapshot(review)
    end

    test "reports sync restored once the fix is cherry-picked onto the stack",
         %{dir: dir, review: review} do
      commit_on!(dir, "feat", [{"fix.txt", "fix\n"}])
      git!(dir, ["checkout", "-q", "feat-review"])
      git!(dir, ["cherry-pick", "feat"])

      assert %{refs_valid: true, stack_in_sync: true} = Reviews.refs_snapshot(review)
    end

    test "disables only the stack when its ref vanishes", %{dir: dir, review: review} do
      git!(dir, ["branch", "-D", "feat-review"])

      assert %{
               stack_ref: "feat-review",
               refs_valid: true,
               stack_valid: false,
               stack_in_sync: false
             } =
               Reviews.refs_snapshot(review)

      assert ["a.txt", "b.txt"] = paths(Reviews.list_files(review, %{}))

      assert {:ok, {:inline, _diff, "text/x-diff"}} =
               Reviews.fetch_content_by_path(review, "a.txt")

      assert {:error, :path_not_in_review} =
               Reviews.fetch_content_by_path(review, "a.txt", %{view: :stack})
    end

    test "carries no stack fields for a review without a stack", %{dir: dir, project: project} do
      {:ok, review} = create(project, dir, nil)

      assert %{stack_ref: nil, refs_valid: true, stack_valid: nil, stack_in_sync: nil} =
               Reviews.refs_snapshot(review)
    end
  end

  describe "list_diff_commits/2 in the stack view" do
    setup :stacked_review

    test "lists the stack's steps newest first with their full messages", %{review: review} do
      assert {:ok,
              [
                %{subject: "add b", body: "Second step."},
                %{subject: "add a.txt", body: ""}
              ]} = Reviews.list_diff_commits(review, :stack)
    end

    test "answers :no_stack for a review without a stack", %{dir: dir, project: project} do
      {:ok, review} = create(project, dir, nil)

      assert {:error, :no_stack} = Reviews.list_diff_commits(review, :stack)
    end
  end

  describe "list_files/2 in the stack view" do
    setup [:stacked_review, :steps]

    test "lists the whole stack diff under scope all", %{review: review} do
      assert ["a.txt", "b.txt"] = paths(Reviews.list_files(review, %{view: :stack}))
    end

    test "lists only one step's files under a single-commit scope",
         %{review: review, first: first, second: second} do
      assert ["a.txt"] =
               paths(Reviews.list_files(review, %{view: :stack, scope: {:commits, [first]}}))

      assert ["b.txt"] =
               paths(Reviews.list_files(review, %{view: :stack, scope: {:commits, [second]}}))
    end

    test "keeps an out-of-sync stack readable", %{dir: dir, review: review, second: second} do
      commit_on!(dir, "feat", [{"fix.txt", "fix\n"}])

      assert ["b.txt"] =
               paths(Reviews.list_files(review, %{view: :stack, scope: {:commits, [second]}}))
    end
  end

  describe "fetch_content_by_path/3 in the stack view" do
    setup [:stacked_review, :steps]

    test "renders one step's patch", %{review: review, second: second} do
      lens = %{view: :stack, scope: {:commits, [second]}}

      assert {:ok, {:inline, diff, "text/x-diff"}} =
               Reviews.fetch_content_by_path(review, "b.txt", lens)

      assert diff =~ "+b"
    end

    test "renders base...stack under scope all", %{review: review} do
      assert {:ok, {:inline, diff, "text/x-diff"}} =
               Reviews.fetch_content_by_path(review, "a.txt", %{view: :stack})

      assert diff =~ "+a"
    end

    test "rejects a path the step does not touch", %{review: review, second: second} do
      lens = %{view: :stack, scope: {:commits, [second]}}

      assert {:error, :path_not_in_review} = Reviews.fetch_content_by_path(review, "a.txt", lens)
    end

    test "rejects a source commit as outside the stack", %{review: review} do
      {:ok, [%{sha: source_sha}]} = Reviews.list_diff_commits(review)
      lens = %{view: :stack, scope: {:commits, [source_sha]}}

      assert {:error, :commit_not_in_range} =
               Reviews.fetch_content_by_path(review, "a.txt", lens)
    end

    test "rejects a working-tree worktree", %{review: review} do
      assert {:error, :invalid_scope_worktree_combination} =
               Reviews.fetch_content_by_path(review, "a.txt", %{view: :stack, worktree: :staged})
    end

    test "answers :no_stack for a review without a stack", %{dir: dir, project: project} do
      {:ok, review} = create(project, dir, nil)

      assert {:error, :no_stack} =
               Reviews.fetch_content_by_path(review, "a.txt", %{view: :stack})
    end
  end

  describe "ChangesWatcher in the stack view" do
    setup [:stacked_review, :steps, :watch]

    test "serves fresh files and content once a fix is cherry-picked onto the stack",
         %{dir: dir, review: review} do
      lens = %{view: :stack}
      assert ["a.txt", "b.txt"] = paths(ChangesWatcher.list_files(review.id, lens))

      assert {:ok, {:inline, before, _type}} =
               ChangesWatcher.fetch_content(review.id, "a.txt", lens)

      refute before =~ "+fixed"

      commit_on!(dir, "feat", [{"a.txt", "fixed\n"}])
      git!(dir, ["checkout", "-q", "feat-review"])
      git!(dir, ["cherry-pick", "feat"])

      assert ["a.txt", "b.txt"] = paths(ChangesWatcher.list_files(review.id, lens))
      assert {:ok, {:inline, now, _type}} = ChangesWatcher.fetch_content(review.id, "a.txt", lens)
      assert now =~ "+fixed"

      {:ok, [%{sha: fix} | _steps]} = Reviews.list_diff_commits(review, :stack)

      assert ["a.txt"] =
               paths(
                 ChangesWatcher.list_files(review.id, %{view: :stack, scope: {:commits, [fix]}})
               )
    end

    test "serves fresh source files once the head moves", %{dir: dir, review: review} do
      assert ["a.txt", "b.txt"] = paths(ChangesWatcher.list_files(review.id))

      commit_on!(dir, "feat", [{"c.txt", "c\n"}])

      assert ["a.txt", "b.txt", "c.txt"] = paths(ChangesWatcher.list_files(review.id))
    end
  end

  defp create(project, dir, stack) do
    Reviews.create_diff_review(project, %{
      project_path: dir,
      name: "Feat",
      base_ref: "main",
      head_ref: "feat",
      stack_ref: stack
    })
  end

  defp stacked_review(%{dir: dir, project: project}) do
    {:ok, review} = create(project, dir, "feat-review")
    %{review: review}
  end

  # Subscribing keeps the watcher (and its cache) alive past its short test
  # grace window, so a second read can only be fresh by missing the cache.
  defp watch(%{review: review}) do
    :ok = ChangesWatcher.subscribe(review.id)
    :ok
  end

  defp steps(%{review: review}) do
    {:ok, [%{sha: second}, %{sha: first}]} = Reviews.list_diff_commits(review, :stack)
    %{first: first, second: second}
  end

  defp paths(entries), do: Enum.map(entries, & &1.path)

  defp diff_review(%{dir: dir, project: project}) do
    {:ok, review} = create(project, dir, nil)
    %{review: review}
  end

  # `main` holds a seed; `feat` adds a.txt and b.txt in one commit; `feat-review`
  # re-cuts the same change from the fork point as two steps.
  defp stacked_repo(%{tmp_dir: dir}) do
    git!(dir, ["init", "-q", "-b", "main", "."])
    write_commit!(dir, [{"seed.txt", "seed\n"}], "seed")
    branch_from!(dir, "feat", "main", [{"a.txt", "a\n"}, {"b.txt", "b\n"}])
    branch_from!(dir, "feat-review", "main", [{"a.txt", "a\n"}])
    write_commit!(dir, [{"b.txt", "b\n"}], "add b\n\nSecond step.")
    git!(dir, ["checkout", "-q", "main"])

    %{dir: dir, project: insert(:project)}
  end

  defp branch_from!(dir, name, start, files) do
    git!(dir, ["checkout", "-q", "-b", name, start])
    write_commit!(dir, files, "add #{Enum.map_join(files, ", ", &elem(&1, 0))}")
  end

  defp commit_on!(dir, branch, files) do
    git!(dir, ["checkout", "-q", branch])
    write_commit!(dir, files, "on #{branch}")
  end

  defp write_commit!(dir, files, message) do
    for {path, content} <- files, do: File.write!(Path.join(dir, path), content)
    git!(dir, ["add", "."])
    git!(dir, ["commit", "-q", "-m", message])
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

    {_out, 0} = System.cmd("git", args, cd: dir, env: env, stderr_to_stdout: true)
    :ok
  end
end

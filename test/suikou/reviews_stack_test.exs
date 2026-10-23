defmodule Suikou.ReviewsStackTest do
  use Suikou.DataCase

  import Suikou.Factory

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
      assert %{stack_ref: "feat-review", refs_valid: true, stack_in_sync: true} =
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

    test "treats a vanished stack ref as a vanished ref", %{dir: dir, review: review} do
      git!(dir, ["branch", "-D", "feat-review"])

      assert %{stack_ref: "feat-review", refs_valid: false, stack_in_sync: false} =
               Reviews.refs_snapshot(review)
    end

    test "carries no stack fields for a review without a stack", %{dir: dir, project: project} do
      {:ok, review} = create(project, dir, nil)

      assert %{stack_ref: nil, refs_valid: true, stack_in_sync: nil} =
               Reviews.refs_snapshot(review)
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

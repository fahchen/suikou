defmodule Suikou.ReviewsStackTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Reviews
  alias Suikou.Schemas.ReviewSource.GitDiff

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

  defp create(project, dir, stack) do
    Reviews.create_diff_review(project, %{
      project_path: dir,
      name: "Feat",
      base_ref: "main",
      head_ref: "feat",
      stack_ref: stack
    })
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

defmodule Suikou.Critique.DiffHunkAuthoringTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Repo
  alias Suikou.Reviews
  alias Suikou.Rounds
  alias Suikou.Schemas.Anchor.DiffHunk

  describe "add_comment with a diff_hunk anchor" do
    @tag :tmp_dir
    test "captures the prefix-stripped quote from the artifact's live diff", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "one\ntwo\nthree\n") end)

      review = diff_review_with(dir, "main", "topic")
      {:ok, artifact} = Reviews.open_file(review, "a.txt")
      round = Rounds.latest(artifact.id)

      assert {:ok, comment} =
               Critique.add_comment(%{
                 round_id: round.id,
                 scope: :located,
                 anchor: %{
                   type: "diff_hunk",
                   side: "new",
                   start_line: 1,
                   end_line: 2
                 },
                 critique_type: :note,
                 body: "explain this hunk"
               })

      assert %{
               anchor: %DiffHunk{
                 side: :new,
                 start_line: 1,
                 end_line: 2,
                 quote: "one\ntwo"
               }
             } = comment
    end

  end

  defp diff_review_with(dir, base, head) do
    project = insert(:project, path: dir)

    {:ok, review} =
      Reviews.create_diff_review(project, %{name: "Diff", base_ref: base, head_ref: head})

    Repo.preload(review, :project)
  end

  defp init_repo!(dir) do
    File.mkdir_p!(dir)
    git!(dir, ["init", "-q", "-b", "main", "."])
    File.write!(Path.join(dir, "seed.txt"), "seed\n")
    git!(dir, ["add", "."])
    git!(dir, ["commit", "-q", "-m", "seed"])
  end

  defp branch!(dir, name, edit) when is_function(edit, 0) do
    git!(dir, ["checkout", "-q", "-b", name])
    edit.()
    git!(dir, ["add", "."])
    git!(dir, ["commit", "-q", "-m", "topic"])
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

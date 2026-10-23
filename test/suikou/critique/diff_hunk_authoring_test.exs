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

    @tag :tmp_dir
    test "a line-range anchor on a diff artifact is rejected, not stored dead", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "one\ntwo\nthree\n") end)

      review = diff_review_with(dir, "main", "topic")
      {:ok, artifact} = Reviews.open_file(review, "a.txt")
      round = Rounds.latest(artifact.id)

      # It would capture its quote from the working-tree file while the artifact
      # renders as a diff, so the anchor could never resolve — the mirror of
      # `diff_hunk` being rejected on a file artifact.
      assert {:error, :unknown_anchor_type} =
               Critique.add_comment(%{
                 round_id: round.id,
                 scope: :located,
                 anchor: %{type: "line_range", start_line: 1, end_line: 2},
                 critique_type: :note,
                 body: "wrong anchor kind"
               })
    end
  end

  describe "add_comment with a diff_hunk anchor under a lens" do
    @describetag :tmp_dir
    setup :prepended_repo

    test "captures the clicked line from a commit scope's diff, not the head's",
         %{round: round, first: first} do
      assert {:ok, %{anchor: %DiffHunk{start_line: 1, quote: "one"}}} =
               add_hunk(round, %{scope: {:commits, [first]}})
    end

    test "captures the clicked line from a stack step's diff", %{dir: dir, review: review} do
      git!(dir, ["branch", "topic-review", "topic"])
      {:ok, review} = Reviews.set_stack(review, "topic-review")
      {:ok, [_second, %{sha: first}]} = Reviews.list_diff_commits(review, :stack)
      {:ok, artifact} = Reviews.open_file(review, "a.txt")
      round = Rounds.latest(artifact.id)

      assert {:ok, %{anchor: %DiffHunk{start_line: 1, quote: "one"}}} =
               add_hunk(round, %{view: :stack, scope: {:commits, [first]}})
    end

    test "keeps capturing from the artifact's own diff without a lens", %{round: round} do
      assert {:ok, %{anchor: %DiffHunk{start_line: 1, quote: "zero"}}} = add_hunk(round, %{})
      assert {:ok, %{anchor: %DiffHunk{quote: "zero"}}} = add_hunk(round, nil)
    end

    test "rejects a lens the review cannot read", %{round: round} do
      assert {:error, :no_stack} = add_hunk(round, %{view: :stack})
      assert {:error, :commit_not_in_range} = add_hunk(round, %{scope: {:commits, ["abcd1234"]}})
    end
  end

  defp add_hunk(round, lens) do
    Critique.add_comment(%{
      round_id: round.id,
      scope: :located,
      anchor: %{type: "diff_hunk", side: "new", start_line: 1, end_line: 1},
      lens: lens,
      critique_type: :note,
      body: "this line"
    })
  end

  # `topic` adds a.txt in its first commit and prepends a line in its second, so
  # new-side line 1 is "one" in the first commit but "zero" at the head.
  defp prepended_repo(%{tmp_dir: dir}) do
    init_repo!(dir)
    branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "one\ntwo\n") end)
    File.write!(Path.join(dir, "a.txt"), "zero\none\ntwo\n")
    git!(dir, ["commit", "-q", "-am", "prepend"])

    review = diff_review_with(dir, "main", "topic")
    {:ok, [_second, %{sha: first}]} = Reviews.list_diff_commits(review)
    {:ok, artifact} = Reviews.open_file(review, "a.txt")

    %{dir: dir, review: review, round: Rounds.latest(artifact.id), first: first}
  end

  defp diff_review_with(dir, base, head) do
    project = insert(:project)
    project_path = dir

    {:ok, review} =
      Reviews.create_diff_review(project, %{
        project_path: project_path,
        name: "Diff",
        base_ref: base,
        head_ref: head
      })

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

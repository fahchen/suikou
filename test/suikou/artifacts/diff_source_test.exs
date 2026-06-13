defmodule Suikou.Artifacts.DiffSourceTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Artifacts
  alias Suikou.Repo
  alias Suikou.Reviews
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Round

  describe "create_from_diff/2" do
    @tag :tmp_dir
    test "mints round 0 with the diff text's content hash", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)

      review = diff_review_with(dir, "main", "topic")

      assert {:ok, %{artifact: %Artifact{file_path: "a.txt"} = artifact, round: %Round{} = round}} =
               Artifacts.create_from_diff(review, "a.txt")

      assert %Round{number: 0, content_hash: hash} = round

      {:ok, expected_diff} =
        Suikou.Git.file_diff(dir, "main", "topic", "a.txt")

      assert hash == Base.encode16(:crypto.hash(:sha256, expected_diff))
      assert artifact.review_id == review.id
    end

    @tag :tmp_dir
    test "rejects a path with no diff between the refs", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)

      review = diff_review_with(dir, "main", "topic")

      assert {:error, :not_changed} = Artifacts.create_from_diff(review, "untouched.txt")
    end
  end

  describe "resnapshot/1 (git-diff)" do
    @tag :tmp_dir
    test "refreshes the round's content hash when head moves", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)

      review = diff_review_with(dir, "main", "topic")
      {:ok, artifact} = Reviews.open_file(review, "a.txt")
      first = Rounds.latest(artifact.id)

      # Move the head branch forward — the diff text changes, so the hash must.
      git!(dir, ["checkout", "-q", "topic"])
      File.write!(Path.join(dir, "a.txt"), "newer\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "topic2"])

      assert {:ok, %Round{} = updated} = Artifacts.resnapshot(first.id)
      refute updated.content_hash == first.content_hash
    end
  end

  describe "content_source/1" do
    @tag :tmp_dir
    test "answers {:inline, diff, text/x-diff} for a git-diff artifact", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)

      review = diff_review_with(dir, "main", "topic")
      {:ok, artifact} = Reviews.open_file(review, "a.txt")

      assert {:ok, {:inline, diff, "text/x-diff"}} = Artifacts.content_source(artifact.id)
      assert diff =~ "diff --git a/a.txt b/a.txt"
      assert diff =~ "+new"
    end

    @tag :tmp_dir
    test "answers {:file, absolute} for a file-selection artifact", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = insert(:review, project: build(:project, path: dir))
      {:ok, %{artifact: artifact}} = Artifacts.create_from_file(review, "plan.md")

      assert {:ok, {:file, absolute}} = Artifacts.content_source(artifact.id)
      assert absolute == Path.join(dir, "plan.md")
    end

    test "answers {:error, :artifact_not_found} for an unknown artifact" do
      assert {:error, :artifact_not_found} = Artifacts.content_source(Ecto.UUID.generate())
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

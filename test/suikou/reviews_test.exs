defmodule Suikou.ReviewsTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Repo
  alias Suikou.Reviews
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.ReviewSource.GitDiff

  describe "create_review/2" do
    @tag :tmp_dir
    test "stores the selection without minting any artifacts", %{tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join([dir, "docs", "plan.md"]), "# Plan\n")
      File.write!(Path.join(dir, "readme.md"), "# Readme\n")
      project = insert(:project, path: dir)

      assert {:ok, review} =
               Reviews.create_review(project, %{name: "Launch", selections: ["docs", "readme.md"]})

      assert review.source.selection_paths == ["docs", "readme.md"]
      assert Repo.aggregate(Artifact, :count) == 0
    end

    @tag :tmp_dir
    test "succeeds even when a selected file is unreadable (validated on open)", %{tmp_dir: dir} do
      project = insert(:project, path: dir)

      assert {:ok, _review} =
               Reviews.create_review(project, %{name: "Launch", selections: ["missing.md"]})
    end

    @tag :tmp_dir
    test "rejects an empty selection", %{tmp_dir: dir} do
      project = insert(:project, path: dir)

      assert {:error, :no_files} =
               Reviews.create_review(project, %{name: "Launch", selections: []})
    end

    @tag :tmp_dir
    test "rejects a blank name", %{tmp_dir: dir} do
      project = insert(:project, path: dir)

      assert {:error, %Ecto.Changeset{}} =
               Reviews.create_review(project, %{name: "  ", selections: ["plan.md"]})
    end
  end

  describe "open_file/2" do
    @tag :tmp_dir
    test "mints a round-0 artifact on first open and returns the same one after", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = review_with(dir, ["plan.md"])

      assert {:ok, artifact} = Reviews.open_file(review, "plan.md")
      assert %{number: 0} = Rounds.latest(artifact.id)

      assert {:ok, ^artifact} = Reviews.open_file(review, "plan.md")
      assert Repo.aggregate(Artifact, :count) == 1
    end

    @tag :tmp_dir
    test "opens a file covered by a selected directory", %{tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join([dir, "docs", "plan.md"]), "# Plan\n")
      review = review_with(dir, ["docs"])

      assert {:ok, %Artifact{file_path: "docs/plan.md"}} =
               Reviews.open_file(review, "docs/plan.md")
    end

    @tag :tmp_dir
    test "restores a soft-removed artifact rather than minting a duplicate", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = review_with(dir, ["plan.md"])
      {:ok, _artifact} = Reviews.open_file(review, "plan.md")
      {:ok, _review} = Reviews.set_selection(review, [])

      assert {:ok, restored} = Reviews.open_file(review, "plan.md")
      assert is_nil(restored.removed_at)
      assert Repo.aggregate(Artifact, :count) == 1
    end

    @tag :tmp_dir
    test "rejects a path not covered by the selection", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = review_with(dir, ["plan.md"])

      assert {:error, :not_covered} = Reviews.open_file(review, "other.md")
      assert Repo.aggregate(Artifact, :count) == 0
    end

    @tag :tmp_dir
    test "surfaces a per-file error when the covered file is unreadable", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "blank.md"), "   \n")
      review = review_with(dir, ["blank.md"])

      assert {:error, :empty_content} = Reviews.open_file(review, "blank.md")
      assert Repo.aggregate(Artifact, :count) == 0
    end
  end

  describe "set_selection/2" do
    @tag :tmp_dir
    test "stores the new selection and mints nothing", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\n")
      review = review_with(dir, ["plan.md"])

      assert {:ok, _review} = Reviews.set_selection(review, ["plan.md", "spec.md"])
      assert Reviews.get_review(review.id).source.selection_paths == ["plan.md", "spec.md"]
      assert Repo.aggregate(Artifact, :count) == 0
    end

    @tag :tmp_dir
    test "soft-removes a deselected opened file but keeps its history", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\n")
      review = review_with(dir, ["plan.md", "spec.md"])
      {:ok, _a} = Reviews.open_file(review, "plan.md")
      {:ok, _b} = Reviews.open_file(review, "spec.md")

      assert {:ok, _review} = Reviews.set_selection(review, ["plan.md"])

      assert [%{file_path: "plan.md"}] = Reviews.get_review(review.id).artifacts
      assert Repo.aggregate(Artifact, :count) == 2
    end

    @tag :tmp_dir
    test "restores a re-selected opened file given a review preloaded active-only", %{
      tmp_dir: dir
    } do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = review_with(dir, ["plan.md"])
      {:ok, _a} = Reviews.open_file(review, "plan.md")
      {:ok, _removed} = Reviews.set_selection(Reviews.get_review(review.id), [])

      assert {:ok, _review} = Reviews.set_selection(Reviews.get_review(review.id), ["plan.md"])

      assert [%{file_path: "plan.md"}] = Reviews.get_review(review.id).artifacts
      assert Repo.aggregate(Artifact, :count) == 1
    end
  end

  describe "list_files/1" do
    @tag :tmp_dir
    test "expands the selection, reporting opened vs unopened files", %{tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join([dir, "docs", "plan.md"]), "# Plan\n")
      File.write!(Path.join([dir, "docs", "spec.md"]), "# Spec\n")
      review = review_with(dir, ["docs"])
      {:ok, opened} = Reviews.open_file(review, "docs/plan.md")

      files = Reviews.list_files(Reviews.get_review(review.id))

      assert [
               %{
                 path: "docs/plan.md",
                 artifact_id: id,
                 approved: false,
                 verdict: nil,
                 content_hash: plan_hash,
                 change_status: nil
               },
               %{
                 path: "docs/spec.md",
                 artifact_id: nil,
                 approved: false,
                 verdict: nil,
                 content_hash: spec_hash,
                 change_status: nil
               }
             ] = files

      assert id == opened.id

      assert plan_hash ==
               Base.encode16(:crypto.hash(:sha256, "# Plan\n"))

      assert spec_hash ==
               Base.encode16(:crypto.hash(:sha256, "# Spec\n"))
    end

    @tag :tmp_dir
    test "includes a file added under a selected directory after creation", %{tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join([dir, "docs", "plan.md"]), "# Plan\n")
      review = review_with(dir, ["docs"])

      File.write!(Path.join([dir, "docs", "later.md"]), "# Later\n")

      paths = review.id |> Reviews.get_review() |> Reviews.list_files() |> Enum.map(& &1.path)
      assert paths == ["docs/later.md", "docs/plan.md"]
    end

    @tag :tmp_dir
    test "excludes a gitignored file lingering in the selection when respect_gitignore is true",
         %{tmp_dir: dir} do
      File.write!(Path.join(dir, ".gitignore"), "secret.txt\n")
      File.write!(Path.join(dir, "secret.txt"), "shh\n")
      File.write!(Path.join(dir, "visible.md"), "# Visible\n")
      project = insert(:project, path: dir, respect_gitignore: true)

      {:ok, review} =
        Reviews.create_review(project, %{name: "Launch", selections: ["secret.txt", "visible.md"]})

      paths = review.id |> Reviews.get_review() |> Reviews.list_files() |> Enum.map(& &1.path)

      assert paths == ["visible.md"]
    end

    @tag :tmp_dir
    test "includes soft-removed artifacts as dimmed rows so the reviewer can see them (C8)",
         %{tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "docs"))
      File.write!(Path.join([dir, "docs", "keep.md"]), "# Keep\n")
      File.write!(Path.join([dir, "docs", "drop.md"]), "# Drop\n")
      review = review_with(dir, ["docs/keep.md", "docs/drop.md"])
      {:ok, _drop} = Reviews.open_file(review, "docs/drop.md")
      {:ok, _kept} = Reviews.remove_file(Reviews.get_review(review.id), "docs/drop.md")

      files = Reviews.list_files(Reviews.get_review(review.id))
      paths = Enum.map(files, & &1.path)
      assert "docs/keep.md" in paths
      assert "docs/drop.md" in paths

      assert %{soft_removed: true, artifact_id: id} =
               Enum.find(files, &(&1.path == "docs/drop.md"))

      assert is_binary(id)

      assert %{soft_removed: false} =
               Enum.find(files, &(&1.path == "docs/keep.md"))
    end

    @tag :tmp_dir
    test "includes a gitignored file in the selection when respect_gitignore is false",
         %{tmp_dir: dir} do
      File.write!(Path.join(dir, ".gitignore"), "secret.txt\n")
      File.write!(Path.join(dir, "secret.txt"), "shh\n")
      File.write!(Path.join(dir, "visible.md"), "# Visible\n")
      project = insert(:project, path: dir, respect_gitignore: false)

      {:ok, review} =
        Reviews.create_review(project, %{name: "Launch", selections: ["secret.txt", "visible.md"]})

      paths =
        review.id
        |> Reviews.get_review()
        |> Reviews.list_files()
        |> Enum.map(& &1.path)
        |> Enum.sort()

      assert paths == ["secret.txt", "visible.md"]
    end
  end

  describe "delete_review/1" do
    @tag :tmp_dir
    test "deletes the review and cascades to its opened artifacts", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = review_with(dir, ["plan.md"])
      {:ok, _a} = Reviews.open_file(review, "plan.md")

      assert {:ok, _review} = Reviews.delete_review(review)
      assert is_nil(Reviews.get_review(review.id))
      assert Repo.aggregate(Artifact, :count) == 0
    end
  end

  describe "rename_review/2" do
    @tag :tmp_dir
    test "renames the review, leaving its selection untouched", %{tmp_dir: dir} do
      review = review_with(dir, ["plan.md"])

      assert {:ok, %{name: "Spec pass"}} = Reviews.rename_review(review, "Spec pass")
      assert Reviews.get_review(review.id).source.selection_paths == ["plan.md"]
    end

    @tag :tmp_dir
    test "rejects a blank name", %{tmp_dir: dir} do
      review = review_with(dir, ["plan.md"])

      assert {:error, %Ecto.Changeset{}} = Reviews.rename_review(review, "  ")
    end
  end

  describe "get_review/1 and list_for_project/1" do
    @tag :tmp_dir
    test "get_review preloads only active artifacts", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "spec.md"), "# Spec\n")
      review = review_with(dir, ["plan.md", "spec.md"])
      {:ok, _a} = Reviews.open_file(review, "plan.md")
      {:ok, _b} = Reviews.open_file(review, "spec.md")
      {:ok, _review} = Reviews.set_selection(review, ["plan.md"])

      assert %{artifacts: [%{file_path: "plan.md"}]} = Reviews.get_review(review.id)
    end

    test "get_review returns nil for an unknown id" do
      assert is_nil(Reviews.get_review("00000000-0000-7000-8000-000000000000"))
    end

    @tag :tmp_dir
    test "list_for_project returns a project's reviews newest first", %{tmp_dir: dir} do
      project = insert(:project, path: dir)
      {:ok, _first} = Reviews.create_review(project, %{name: "First", selections: ["plan.md"]})
      {:ok, _second} = Reviews.create_review(project, %{name: "Second", selections: ["plan.md"]})

      assert [%{name: "Second"}, %{name: "First"}] = Reviews.list_for_project(project)
    end
  end

  defp review_with(dir, selections) do
    project = insert(:project, path: dir)
    {:ok, review} = Reviews.create_review(project, %{name: "Launch", selections: selections})
    %{review | project: project}
  end

  describe "list_branches/1" do
    @tag :tmp_dir
    test "returns local branches alongside the default branch", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "x\n") end)
      project = insert(:project, path: dir)

      assert {:ok, %{branches: branches, remote_branches: [], default: "main"}} =
               Reviews.list_branches(project)

      assert Enum.sort(branches) == ["main", "topic"]
    end

    @tag :tmp_dir
    test "lists origin remote-tracking branches alongside locals", %{tmp_dir: dir} do
      origin = Path.join(dir, "origin.git")
      work = Path.join(dir, "work")
      File.mkdir_p!(origin)
      git!(origin, ["init", "--bare", "-q", "-b", "main", "."])
      init_repo!(work)
      git!(work, ["remote", "add", "origin", origin])
      git!(work, ["push", "-q", "-u", "origin", "main"])
      project = insert(:project, path: work)

      assert {:ok, %{branches: ["main"], remote_branches: ["origin/main"], default: "main"}} =
               Reviews.list_branches(project)
    end

    @tag :tmp_dir
    test "errors when the project path is not a git repo", %{tmp_dir: dir} do
      project = insert(:project, path: dir)
      assert {:error, :not_a_git_repo} = Reviews.list_branches(project)
    end
  end

  describe "create_diff_review/2" do
    @tag :tmp_dir
    test "creates a git-diff review with the given refs", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "x\n") end)
      project = insert(:project, path: dir)

      assert {:ok, review} =
               Reviews.create_diff_review(project, %{
                 name: "Topic vs main",
                 base_ref: "main",
                 head_ref: "topic"
               })

      assert %GitDiff{base_ref: "main", head_ref: "topic"} = review.source
    end

    @tag :tmp_dir
    test "defaults base_ref to the repo default branch", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "x\n") end)
      project = insert(:project, path: dir)

      assert {:ok, review} =
               Reviews.create_diff_review(project, %{name: "Topic", head_ref: "topic"})

      assert %GitDiff{base_ref: "main", head_ref: "topic"} = review.source
    end

    @tag :tmp_dir
    test "rejects a project whose path is not a git repo", %{tmp_dir: dir} do
      project = insert(:project, path: dir)

      assert {:error, :not_a_git_repo} =
               Reviews.create_diff_review(project, %{name: "Topic", head_ref: "topic"})
    end

    @tag :tmp_dir
    test "rejects a missing head_ref param", %{tmp_dir: dir} do
      init_repo!(dir)
      project = insert(:project, path: dir)

      assert {:error, :missing_head_ref} =
               Reviews.create_diff_review(project, %{name: "Topic", base_ref: "main"})
    end

    @tag :tmp_dir
    test "rejects an unknown base_ref", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "x\n") end)
      project = insert(:project, path: dir)

      assert {:error, :base_ref_not_found} =
               Reviews.create_diff_review(project, %{
                 name: "Topic",
                 base_ref: "missing",
                 head_ref: "topic"
               })
    end

    @tag :tmp_dir
    test "rejects an unknown head_ref", %{tmp_dir: dir} do
      init_repo!(dir)
      project = insert(:project, path: dir)

      assert {:error, :head_ref_not_found} =
               Reviews.create_diff_review(project, %{
                 name: "Topic",
                 base_ref: "main",
                 head_ref: "ghost"
               })
    end

    @tag :tmp_dir
    test "rejects a blank name", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "x\n") end)
      project = insert(:project, path: dir)

      assert {:error, %Ecto.Changeset{}} =
               Reviews.create_diff_review(project, %{
                 name: "  ",
                 base_ref: "main",
                 head_ref: "topic"
               })
    end

    @tag :tmp_dir
    test "rejects a ref pair with no changed files", %{tmp_dir: dir} do
      init_repo!(dir)
      project = insert(:project, path: dir)

      assert {:error, :no_changes} =
               Reviews.create_diff_review(project, %{
                 name: "Empty",
                 base_ref: "main",
                 head_ref: "main"
               })
    end
  end

  describe "list_files/1 (git diff)" do
    @tag :tmp_dir
    test "lists the changed files between the review's refs", %{tmp_dir: dir} do
      init_repo!(dir)

      branch!(dir, "topic", fn ->
        File.write!(Path.join(dir, "a.txt"), "x\n")
        File.mkdir_p!(Path.join(dir, "docs"))
        File.write!(Path.join([dir, "docs", "b.txt"]), "y\n")
      end)

      review = diff_review_with(dir, "main", "topic")

      files = Reviews.list_files(Reviews.get_review(review.id))

      assert [
               %{
                 path: "a.txt",
                 artifact_id: nil,
                 approved: false,
                 verdict: nil,
                 content_hash: a_hash,
                 change_status: :added
               },
               %{
                 path: "docs/b.txt",
                 artifact_id: nil,
                 approved: false,
                 verdict: nil,
                 content_hash: b_hash,
                 change_status: :added
               }
             ] = files

      # Git blob hashes are 40-char lowercase hex strings.
      assert String.match?(a_hash, ~r/^[0-9a-f]{40}$/)
      assert String.match?(b_hash, ~r/^[0-9a-f]{40}$/)
    end

    @tag :tmp_dir
    test "tags each file with its diff modification kind", %{tmp_dir: dir} do
      init_repo!(dir)
      File.write!(Path.join(dir, "modify_me.txt"), "v1\n")
      File.write!(Path.join(dir, "delete_me.txt"), "bye\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "seed"])

      branch!(dir, "topic", fn ->
        File.write!(Path.join(dir, "modify_me.txt"), "v2\n")
        File.rm!(Path.join(dir, "delete_me.txt"))
        File.write!(Path.join(dir, "added.txt"), "new\n")
      end)

      review = diff_review_with(dir, "main", "topic")
      files = Reviews.list_files(Reviews.get_review(review.id))
      statuses = Map.new(files, &{&1.path, &1.change_status})

      assert statuses["added.txt"] == :added
      assert statuses["modify_me.txt"] == :modified
      assert statuses["delete_me.txt"] == :deleted
    end

    @tag :tmp_dir
    test "carries per-file added/deleted line counts from numstat", %{tmp_dir: dir} do
      init_repo!(dir)
      File.write!(Path.join(dir, "modify_me.txt"), "one\ntwo\nthree\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "seed"])

      branch!(dir, "topic", fn ->
        File.write!(Path.join(dir, "modify_me.txt"), "one\nTWO\nthree\nfour\n")
        File.write!(Path.join(dir, "brand_new.txt"), "hello\nworld\n")
      end)

      review = diff_review_with(dir, "main", "topic")
      files = Reviews.list_files(Reviews.get_review(review.id))
      stats = Map.new(files, &{&1.path, {&1.added, &1.deleted}})

      assert stats["modify_me.txt"] == {2, 1}
      assert stats["brand_new.txt"] == {2, 0}
    end
  end

  describe "fetch_content_by_path/2" do
    @tag :tmp_dir
    test "returns on-disk bytes via {:file, absolute} for a file-selection review",
         %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = review_with(dir, ["plan.md"])

      assert {:ok, {:file, absolute}} =
               Reviews.fetch_content_by_path(Reviews.get_review(review.id), "plan.md")

      assert absolute == Path.join(dir, "plan.md")
    end

    @tag :tmp_dir
    test "returns the live diff inline for a git-diff review", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)
      review = diff_review_with(dir, "main", "topic")

      assert {:ok, {:inline, diff, "text/x-diff"}} =
               Reviews.fetch_content_by_path(Reviews.get_review(review.id), "a.txt")

      assert diff =~ "diff --git a/a.txt b/a.txt"
      assert diff =~ "+new"
    end

    @tag :tmp_dir
    test "rejects a path outside the review's file set", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "secret.txt"), "shh\n")
      review = review_with(dir, ["plan.md"])

      assert {:error, :path_not_in_review} =
               Reviews.fetch_content_by_path(Reviews.get_review(review.id), "secret.txt")
    end

    @tag :tmp_dir
    test "rejects a `..` traversal path", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = review_with(dir, ["plan.md"])

      assert {:error, :path_not_in_review} =
               Reviews.fetch_content_by_path(Reviews.get_review(review.id), "../../etc/passwd")
    end

    @tag :tmp_dir
    test "does not mint an artifact when serving content", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = review_with(dir, ["plan.md"])

      {:ok, _content} = Reviews.fetch_content_by_path(Reviews.get_review(review.id), "plan.md")

      assert Repo.aggregate(Artifact, :count) == 0
    end
  end

  describe "fetch_content_by_path/3 (live lens, BDR-0024)" do
    @tag :tmp_dir
    test "commit scope returns only that commit's diff", %{tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "one\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "add a"])
      {sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha = String.trim(sha)
      File.write!(Path.join(dir, "b.txt"), "two\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "add b"])

      review = diff_review_with(dir, "main", "topic")

      assert {:ok, {:inline, diff, "text/x-diff"}} =
               Reviews.fetch_content_by_path(
                 Reviews.get_review(review.id),
                 "a.txt",
                 %{scope: {:commits, [sha]}}
               )

      assert diff =~ "+one"
      refute diff =~ "b.txt"
    end

    @tag :tmp_dir
    test "multi-commit scope spans the range oldest..newest", %{tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "one\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "add a"])
      {sha_a, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha_a = String.trim(sha_a)
      File.write!(Path.join(dir, "a.txt"), "two\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "edit a"])
      {sha_b, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha_b = String.trim(sha_b)

      review = diff_review_with(dir, "main", "topic")

      # `list_diff_commits/1` orders newest first; feed the same order in.
      assert {:ok, {:inline, diff, "text/x-diff"}} =
               Reviews.fetch_content_by_path(
                 Reviews.get_review(review.id),
                 "a.txt",
                 %{scope: {:commits, [sha_b, sha_a]}}
               )

      assert diff =~ "+two"
      refute diff =~ "+one"
    end

    @tag :tmp_dir
    test "empty commits list normalizes to :all", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)
      review = diff_review_with(dir, "main", "topic")

      empty =
        Reviews.fetch_content_by_path(Reviews.get_review(review.id), "a.txt", %{
          scope: {:commits, []}
        })

      all = Reviews.fetch_content_by_path(Reviews.get_review(review.id), "a.txt", %{scope: :all})
      assert empty == all
    end

    @tag :tmp_dir
    test "unstaged worktree returns the working-tree diff", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "seed.txt"), "committed\n") end)
      File.write!(Path.join(dir, "seed.txt"), "worktree edit\n")

      review = diff_review_with(dir, "main", "topic")

      assert {:ok, {:inline, diff, "text/x-diff"}} =
               Reviews.fetch_content_by_path(
                 Reviews.get_review(review.id),
                 "seed.txt",
                 %{worktree: :unstaged}
               )

      assert diff =~ "+worktree edit"
    end

    @tag :tmp_dir
    test "staged worktree returns the index diff vs HEAD", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "seed.txt"), "committed\n") end)
      File.write!(Path.join(dir, "seed.txt"), "staged edit\n")
      git!(dir, ["add", "."])

      review = diff_review_with(dir, "main", "topic")

      assert {:ok, {:inline, diff, "text/x-diff"}} =
               Reviews.fetch_content_by_path(
                 Reviews.get_review(review.id),
                 "seed.txt",
                 %{worktree: :staged}
               )

      assert diff =~ "+staged edit"
    end

    @tag :tmp_dir
    test "rejects commit scope combined with staged worktree", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)
      review = diff_review_with(dir, "main", "topic")
      {sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha = String.trim(sha)

      assert {:error, :invalid_scope_worktree_combination} =
               Reviews.fetch_content_by_path(
                 Reviews.get_review(review.id),
                 "a.txt",
                 %{scope: {:commits, [sha]}, worktree: :staged}
               )
    end

    @tag :tmp_dir
    test "rejects a sha that is not in the review's commit range", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)
      review = diff_review_with(dir, "main", "topic")

      # A sha that resolves to a commit but sits outside base...head (main's HEAD
      # is on main, not in topic's range).
      git!(dir, ["checkout", "-q", "main"])
      {main_sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      main_sha = String.trim(main_sha)

      assert {:error, :commit_not_in_range} =
               Reviews.fetch_content_by_path(
                 Reviews.get_review(review.id),
                 "a.txt",
                 %{scope: {:commits, [main_sha]}}
               )
    end

    @tag :tmp_dir
    test "default lens (empty map) matches fetch_content_by_path/2", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)
      review = diff_review_with(dir, "main", "topic")

      arity2 = Reviews.fetch_content_by_path(Reviews.get_review(review.id), "a.txt")
      arity3 = Reviews.fetch_content_by_path(Reviews.get_review(review.id), "a.txt", %{})
      assert arity2 == arity3
    end
  end

  describe "list_files/2 (live lens, BDR-0024)" do
    @tag :tmp_dir
    test "commit scope narrows the file list to that commit's changes", %{tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "one\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "add a"])
      {sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha = String.trim(sha)
      File.write!(Path.join(dir, "b.txt"), "two\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "add b"])

      review = diff_review_with(dir, "main", "topic")

      paths =
        review.id
        |> Reviews.get_review()
        |> Reviews.list_files(%{scope: {:commits, [sha]}})
        |> Enum.map(& &1.path)

      assert paths == ["a.txt"]
    end

    @tag :tmp_dir
    test "staged worktree lens returns the index vs HEAD file list", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "one\n") end)
      File.write!(Path.join(dir, "staged_only.txt"), "new\n")
      git!(dir, ["add", "."])

      review = diff_review_with(dir, "main", "topic")

      paths =
        review.id
        |> Reviews.get_review()
        |> Reviews.list_files(%{worktree: :staged})
        |> Enum.map(& &1.path)

      assert paths == ["staged_only.txt"]
    end
  end

  describe "open_file/2 (git diff)" do
    @tag :tmp_dir
    test "mints a round-0 artifact for a changed path", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)

      review = diff_review_with(dir, "main", "topic")

      assert {:ok, %Artifact{file_path: "a.txt"} = artifact} =
               Reviews.open_file(review, "a.txt")

      assert %{number: 0} = Rounds.latest(artifact.id)

      assert {:ok, ^artifact} = Reviews.open_file(review, "a.txt")
    end

    @tag :tmp_dir
    test "rejects a path not in the diff", %{tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)

      review = diff_review_with(dir, "main", "topic")

      assert {:error, :not_covered} = Reviews.open_file(review, "untouched.txt")
    end
  end

  describe "list_diff_commits/1" do
    @tag :tmp_dir
    test "lists commits reachable from head but not base, newest first", %{tmp_dir: dir} do
      init_repo!(dir)

      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "one\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "first"])
      File.write!(Path.join(dir, "b.txt"), "two\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "second"])

      review = diff_review_with(dir, "main", "topic")

      assert {:ok, [%{sha: sha2, subject: "second"}, %{sha: sha1, subject: "first"}]} =
               Reviews.list_diff_commits(Reviews.get_review(review.id))

      assert String.match?(sha1, ~r/^[0-9a-f]{40}$/)
      assert String.match?(sha2, ~r/^[0-9a-f]{40}$/)
      assert sha1 != sha2
    end

    test "errors for a file-selection review" do
      review = insert(:review)
      assert {:error, :not_a_diff_review} = Reviews.list_diff_commits(review)
    end
  end

  describe "fetch_commit_diff/2" do
    @tag :tmp_dir
    test "returns the unified diff a single commit introduces vs. its parent", %{tmp_dir: dir} do
      init_repo!(dir)

      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "one\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "add a"])

      review = diff_review_with(dir, "main", "topic")

      {:ok, [%{sha: sha, subject: "add a"}]} =
        Reviews.list_diff_commits(Reviews.get_review(review.id))

      assert {:ok, {:inline, diff, "text/x-diff"}} =
               Reviews.fetch_commit_diff(Reviews.get_review(review.id), sha)

      assert diff =~ "a.txt"
      assert diff =~ "+one"
    end

    test "errors for a file-selection review" do
      review = insert(:review)
      assert {:error, :not_a_diff_review} = Reviews.fetch_commit_diff(review, "deadbeef")
    end

    @tag :tmp_dir
    test "errors when the sha is unknown", %{tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "one\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "add a"])

      review = diff_review_with(dir, "main", "topic")

      assert {:error, :ref_not_found} =
               Reviews.fetch_commit_diff(
                 Reviews.get_review(review.id),
                 "0000000000000000000000000000000000000000"
               )
    end
  end

  defp diff_review_with(dir, base, head) do
    project = insert(:project, path: dir)

    {:ok, review} =
      Reviews.create_diff_review(project, %{name: "Diff", base_ref: base, head_ref: head})

    %{review | project: project}
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

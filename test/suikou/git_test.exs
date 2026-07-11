defmodule Suikou.GitTest do
  use ExUnit.Case, async: true

  alias Suikou.Git

  describe "repo?/1" do
    @tag :tmp_dir
    test "returns true for a git working tree", %{tmp_dir: dir} do
      init_repo!(dir)
      assert Git.repo?(dir)
    end

    @tag :tmp_dir
    test "returns false for a plain directory", %{tmp_dir: dir} do
      refute Git.repo?(dir)
    end

    test "returns false for a missing directory" do
      refute Git.repo?(Path.join(System.tmp_dir!(), "does-not-exist-#{System.unique_integer()}"))
    end
  end

  describe "default_branch/1" do
    @tag :tmp_dir
    test "uses origin/HEAD when the remote is set", %{tmp_dir: dir} do
      origin = Path.join(dir, "origin.git")
      work = Path.join(dir, "work")
      git!(["init", "--bare", "-b", "main", origin])
      init_repo!(work, branch: "main")
      git!(["remote", "add", "origin", origin], cd: work)
      git!(["push", "-u", "origin", "main"], cd: work)
      git!(["remote", "set-head", "origin", "main"], cd: work)

      assert {:ok, "main"} = Git.default_branch(work)
    end

    @tag :tmp_dir
    test "falls back to local main when there is no origin", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")

      assert {:ok, "main"} = Git.default_branch(dir)
    end

    @tag :tmp_dir
    test "falls back to local master when main is absent", %{tmp_dir: dir} do
      init_repo!(dir, branch: "master")

      assert {:ok, "master"} = Git.default_branch(dir)
    end

    @tag :tmp_dir
    test "falls back to current HEAD when neither main nor master exist", %{tmp_dir: dir} do
      init_repo!(dir, branch: "trunk")

      assert {:ok, "trunk"} = Git.default_branch(dir)
    end

    @tag :tmp_dir
    test "returns :not_a_repo for a plain directory", %{tmp_dir: dir} do
      assert {:error, :not_a_repo} = Git.default_branch(dir)
    end
  end

  describe "list_branches/1" do
    @tag :tmp_dir
    test "lists local branches sorted by most recent commit date", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main", date: "2000-01-01T00:00:00")
      git!(["checkout", "-q", "-b", "old-topic"], cd: dir)
      File.write!(Path.join(dir, "a.txt"), "x\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "old topic", date: "2020-01-01T00:00:00")
      git!(["checkout", "-q", "main"], cd: dir)
      git!(["checkout", "-q", "-b", "new-topic"], cd: dir)
      File.write!(Path.join(dir, "b.txt"), "y\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "new topic", date: "2030-01-01T00:00:00")

      assert {:ok, ["new-topic", "old-topic", "main"]} = Git.list_branches(dir)
    end

    @tag :tmp_dir
    test "returns just the initial branch when nothing else exists", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:ok, ["main"]} = Git.list_branches(dir)
    end

    @tag :tmp_dir
    test "returns :not_a_repo for a plain directory", %{tmp_dir: dir} do
      assert {:error, :not_a_repo} = Git.list_branches(dir)
    end

    test "returns :not_a_repo for a missing directory" do
      dir = Path.join(System.tmp_dir!(), "no-such-dir-#{System.unique_integer()}")
      assert {:error, :not_a_repo} = Git.list_branches(dir)
    end
  end

  describe "list_remote_branches/1" do
    @tag :tmp_dir
    test "lists origin remote-tracking branches sorted by recency, excluding origin/HEAD",
         %{tmp_dir: dir} do
      origin = Path.join(dir, "origin.git")
      work = Path.join(dir, "work")
      git!(["init", "--bare", "-b", "main", origin])
      init_repo!(work, branch: "main", date: "2000-01-01T00:00:00")
      git!(["remote", "add", "origin", origin], cd: work)
      git!(["push", "-u", "origin", "main"], cd: work)
      git!(["checkout", "-q", "-b", "topic"], cd: work)
      File.write!(Path.join(work, "a.txt"), "x\n")
      git!(["add", "."], cd: work)
      commit!(work, "topic", date: "2030-01-01T00:00:00")
      git!(["push", "-u", "origin", "topic"], cd: work)
      git!(["remote", "set-head", "origin", "main"], cd: work)

      assert {:ok, ["origin/topic", "origin/main"]} = Git.list_remote_branches(work)
    end

    @tag :tmp_dir
    test "returns an empty list when no origin remote is configured", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:ok, []} = Git.list_remote_branches(dir)
    end

    @tag :tmp_dir
    test "returns :not_a_repo for a plain directory", %{tmp_dir: dir} do
      assert {:error, :not_a_repo} = Git.list_remote_branches(dir)
    end
  end

  describe "ref_exists?/2" do
    @tag :tmp_dir
    test "returns true for an existing branch", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert Git.ref_exists?(dir, "main")
    end

    @tag :tmp_dir
    test "returns false for an unknown ref", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      refute Git.ref_exists?(dir, "no-such-ref")
    end

    @tag :tmp_dir
    test "rejects refs that look like options", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      refute Git.ref_exists?(dir, "--upload-pack=oops")
    end
  end

  describe "changed_files/3" do
    @tag :tmp_dir
    test "lists files changed between base and head with three-dot semantics", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      git!(["checkout", "-b", "topic"], cd: dir)
      File.write!(Path.join(dir, "a.txt"), "hello\nworld\n")
      File.write!(Path.join(dir, "b.txt"), "new file\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "topic edits")

      assert {:ok, paths} = Git.changed_files(dir, "main", "topic")
      assert Enum.sort(paths) == ["a.txt", "b.txt"]
    end

    @tag :tmp_dir
    test "ignores changes on base after the merge-base (three-dot)", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      git!(["checkout", "-b", "topic"], cd: dir)
      File.write!(Path.join(dir, "a.txt"), "hello\nworld\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "topic edits")

      git!(["checkout", "main"], cd: dir)
      File.write!(Path.join(dir, "only-on-main.txt"), "main moved\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "main advances")

      assert {:ok, paths} = Git.changed_files(dir, "main", "topic")
      assert Enum.sort(paths) == ["a.txt"]
    end

    @tag :tmp_dir
    test "returns an error when a ref does not exist", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :ref_not_found} = Git.changed_files(dir, "main", "missing")
    end

    @tag :tmp_dir
    test "rejects refs that look like options", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :invalid_ref} = Git.changed_files(dir, "main", "--evil")
    end
  end

  describe "file_diff/4" do
    @tag :tmp_dir
    test "returns the unified diff for a single file", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "a.txt"), "first\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "seed a")
      git!(["checkout", "-b", "topic"], cd: dir)
      File.write!(Path.join(dir, "a.txt"), "second\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "topic edits a")

      assert {:ok, diff} = Git.file_diff(dir, "main", "topic", "a.txt")
      assert diff =~ "-first"
      assert diff =~ "+second"
    end

    @tag :tmp_dir
    test "returns an empty string when the path is unchanged", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "a.txt"), "first\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "seed a")
      git!(["checkout", "-b", "topic"], cd: dir)
      File.write!(Path.join(dir, "b.txt"), "new\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "topic adds b")

      assert {:ok, ""} = Git.file_diff(dir, "main", "topic", "a.txt")
    end

    @tag :tmp_dir
    test "rejects refs that look like options", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :invalid_ref} = Git.file_diff(dir, "--evil", "main", "a.txt")
    end
  end

  describe "show_blob/3" do
    @tag :tmp_dir
    test "returns the file's bytes at the given ref", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "logo.png"), <<137, 80, 78, 71>>)
      git!(["add", "."], cd: dir)
      commit!(dir, "add binary")

      assert {:ok, bytes} = Git.show_blob(dir, "main", "logo.png")
      assert bytes == <<137, 80, 78, 71>>
    end

    @tag :tmp_dir
    test "returns the historical bytes when the working tree has since diverged",
         %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "note.txt"), "v1\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "v1")
      File.write!(Path.join(dir, "note.txt"), "v2\n")

      assert {:ok, "v1\n"} = Git.show_blob(dir, "main", "note.txt")
    end

    @tag :tmp_dir
    test "returns :git_error for a path absent at the ref", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :git_error} = Git.show_blob(dir, "main", "no-such-file")
    end

    @tag :tmp_dir
    test "returns :ref_not_found for an unknown ref", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :ref_not_found} = Git.show_blob(dir, "missing", "seed.txt")
    end

    @tag :tmp_dir
    test "rejects refs that look like options", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :invalid_ref} = Git.show_blob(dir, "--evil", "seed.txt")
    end
  end

  describe "changed_files_with_status/3" do
    @tag :tmp_dir
    test "tags added, modified, and deleted files", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "a.txt"), "one\n")
      File.write!(Path.join(dir, "b.txt"), "two\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "seed a/b")

      git!(["checkout", "-q", "-b", "topic"], cd: dir)
      File.write!(Path.join(dir, "a.txt"), "one-edited\n")
      File.rm!(Path.join(dir, "b.txt"))
      File.write!(Path.join(dir, "c.txt"), "three\n")
      git!(["add", "-A"], cd: dir)
      commit!(dir, "modify a, delete b, add c")

      assert {:ok, entries} = Git.changed_files_with_status(dir, "main", "topic")
      sorted = Enum.sort_by(entries, & &1.path)

      assert sorted == [
               %{path: "a.txt", status: :modified},
               %{path: "b.txt", status: :deleted},
               %{path: "c.txt", status: :added}
             ]
    end

    @tag :tmp_dir
    test "tags a rename and surfaces only the new path", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "old.txt"), "alpha\nbeta\ngamma\ndelta\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "seed old")

      git!(["checkout", "-q", "-b", "topic"], cd: dir)
      git!(["mv", "old.txt", "new.txt"], cd: dir)
      commit!(dir, "rename old -> new")

      assert {:ok, entries} = Git.changed_files_with_status(dir, "main", "topic")

      assert [%{path: "new.txt", status: :renamed}] = entries
    end

    @tag :tmp_dir
    test "returns :ref_not_found for an unknown ref", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :ref_not_found} = Git.changed_files_with_status(dir, "main", "nope")
    end

    @tag :tmp_dir
    test "rejects refs that look like options", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :invalid_ref} = Git.changed_files_with_status(dir, "--evil", "main")
    end
  end

  describe "list_commits/3" do
    @tag :tmp_dir
    test "returns commits reachable from head but not base, newest first",
         %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      git!(["checkout", "-q", "-b", "topic"], cd: dir)
      File.write!(Path.join(dir, "a.txt"), "a\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "first topic commit")
      File.write!(Path.join(dir, "b.txt"), "b\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "second topic commit")

      assert {:ok,
              [
                %{sha: sha1, subject: "second topic commit"},
                %{sha: sha2, subject: "first topic commit"}
              ]} =
               Git.list_commits(dir, "main", "topic")

      assert String.length(sha1) == 40
      assert String.length(sha2) == 40
      assert sha1 != sha2
    end

    @tag :tmp_dir
    test "returns an empty list when base and head match", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:ok, []} = Git.list_commits(dir, "main", "main")
    end

    @tag :tmp_dir
    test "returns :ref_not_found for an unknown ref", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :ref_not_found} = Git.list_commits(dir, "main", "nope")
    end

    @tag :tmp_dir
    test "rejects refs that look like options", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :invalid_ref} = Git.list_commits(dir, "--evil", "main")
    end

    @tag :tmp_dir
    test "returns :not_a_repo for a plain directory", %{tmp_dir: dir} do
      assert {:error, :not_a_repo} = Git.list_commits(dir, "main", "topic")
    end
  end

  describe "commit_diff/2" do
    @tag :tmp_dir
    test "returns the unified diff introduced by a single commit", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "a.txt"), "first\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "seed a")
      File.write!(Path.join(dir, "a.txt"), "second\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "edit a")

      {sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha = String.trim(sha)

      assert {:ok, diff} = Git.commit_diff(dir, sha)
      assert diff =~ "-first"
      assert diff =~ "+second"
    end

    @tag :tmp_dir
    test "diffs a root commit against the empty tree", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      {sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha = String.trim(sha)

      assert {:ok, diff} = Git.commit_diff(dir, sha)
      assert diff =~ "+seed"
    end

    @tag :tmp_dir
    test "returns :ref_not_found for an unknown sha", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :ref_not_found} = Git.commit_diff(dir, "deadbeef")
    end

    @tag :tmp_dir
    test "rejects refs that look like options", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :invalid_ref} = Git.commit_diff(dir, "--evil")
    end

    @tag :tmp_dir
    test "returns :not_a_repo for a plain directory", %{tmp_dir: dir} do
      assert {:error, :not_a_repo} = Git.commit_diff(dir, "HEAD")
    end
  end

  describe "commit_files/2" do
    @tag :tmp_dir
    test "lists paths a commit changed with status letters mapped", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "a.txt"), "first\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "add a")
      File.write!(Path.join(dir, "a.txt"), "second\n")
      File.write!(Path.join(dir, "b.txt"), "new\n")
      git!(["add", "-A"], cd: dir)
      commit!(dir, "edit a add b")

      {sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha = String.trim(sha)

      assert {:ok, entries} = Git.commit_files(dir, sha)

      assert Enum.sort(entries) ==
               Enum.sort([%{path: "a.txt", status: :modified}, %{path: "b.txt", status: :added}])
    end

    @tag :tmp_dir
    test "root commit surfaces every path as added", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      {sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha = String.trim(sha)

      assert {:ok, [%{path: "seed.txt", status: :added}]} = Git.commit_files(dir, sha)
    end

    @tag :tmp_dir
    test "returns :ref_not_found for an unknown sha", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :ref_not_found} = Git.commit_files(dir, "deadbeef")
    end

    @tag :tmp_dir
    test "rejects refs that look like options", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :invalid_ref} = Git.commit_files(dir, "--evil")
    end

    @tag :tmp_dir
    test "returns :not_a_repo for a plain directory", %{tmp_dir: dir} do
      assert {:error, :not_a_repo} = Git.commit_files(dir, "HEAD")
    end
  end

  describe "commit_file_diff/3" do
    @tag :tmp_dir
    test "returns the per-file patch a commit introduced", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "a.txt"), "first\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "add a")
      File.write!(Path.join(dir, "a.txt"), "second\n")
      File.write!(Path.join(dir, "b.txt"), "new\n")
      git!(["add", "-A"], cd: dir)
      commit!(dir, "edit a add b")

      {sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha = String.trim(sha)

      assert {:ok, diff} = Git.commit_file_diff(dir, sha, "a.txt")
      assert diff =~ "-first"
      assert diff =~ "+second"
      refute diff =~ "b.txt"
    end

    @tag :tmp_dir
    test "returns an empty string when the path is unchanged by the commit", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "a.txt"), "keep\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "add a")
      File.write!(Path.join(dir, "b.txt"), "brand new\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "add b only")

      {sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha = String.trim(sha)

      assert {:ok, ""} = Git.commit_file_diff(dir, sha, "a.txt")
    end

    @tag :tmp_dir
    test "returns :ref_not_found for an unknown sha", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :ref_not_found} = Git.commit_file_diff(dir, "deadbeef", "seed.txt")
    end

    @tag :tmp_dir
    test "rejects refs that look like options", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :invalid_ref} = Git.commit_file_diff(dir, "--evil", "seed.txt")
    end

    @tag :tmp_dir
    test "returns :not_a_repo for a plain directory", %{tmp_dir: dir} do
      assert {:error, :not_a_repo} = Git.commit_file_diff(dir, "HEAD", "a.txt")
    end
  end

  describe "range_diff/4" do
    @tag :tmp_dir
    test "spans oldest..newest, collapsing intermediate commits", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "a.txt"), "one\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "add a")
      {sha_a, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha_a = String.trim(sha_a)

      File.write!(Path.join(dir, "a.txt"), "two\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "edit a")
      {sha_b, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha_b = String.trim(sha_b)

      assert {:ok, diff} = Git.range_diff(dir, sha_a, sha_b, "a.txt")
      # `sha_a`'s parent is the seed commit, which has no `a.txt`; the range
      # spans `<sha_a>^..<sha_b>`, so the final state is `two` and it's an add
      # from the reviewer's perspective.
      assert diff =~ "+two"
      refute diff =~ "+one"
    end

    @tag :tmp_dir
    test "single-commit range delegates to that commit's patch", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "a.txt"), "one\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "add a")
      {sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha = String.trim(sha)

      assert {:ok, diff} = Git.range_diff(dir, sha, sha, "a.txt")
      assert diff =~ "+one"
    end

    @tag :tmp_dir
    test "root oldest falls back to empty-tree diff", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      {root, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      root = String.trim(root)

      # A follow-up commit so `newest` differs from the root.
      File.write!(Path.join(dir, "a.txt"), "one\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "add a")
      {newest, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      newest = String.trim(newest)

      # Range from root..newest includes the seed file's own addition.
      assert {:ok, diff} = Git.range_diff(dir, root, newest, "seed.txt")
      assert diff =~ "+seed"
    end

    @tag :tmp_dir
    test "returns :ref_not_found for an unknown sha", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      {sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha = String.trim(sha)

      assert {:error, :ref_not_found} = Git.range_diff(dir, "deadbeef", sha, "seed.txt")
    end

    @tag :tmp_dir
    test "rejects refs that look like options", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :invalid_ref} = Git.range_diff(dir, "--evil", "HEAD", "seed.txt")
    end

    @tag :tmp_dir
    test "returns :not_a_repo for a plain directory", %{tmp_dir: dir} do
      assert {:error, :not_a_repo} = Git.range_diff(dir, "HEAD", "HEAD", "seed.txt")
    end
  end

  describe "staged_files/1" do
    @tag :tmp_dir
    test "lists paths with staged changes vs HEAD", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "seed.txt"), "changed\n")
      File.write!(Path.join(dir, "new.txt"), "new\n")
      git!(["add", "-A"], cd: dir)

      assert {:ok, entries} = Git.staged_files(dir)

      assert Enum.sort(entries) ==
               Enum.sort([
                 %{path: "seed.txt", status: :modified},
                 %{path: "new.txt", status: :added}
               ])
    end

    @tag :tmp_dir
    test "returns an empty list when the index matches HEAD", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:ok, []} = Git.staged_files(dir)
    end

    @tag :tmp_dir
    test "returns :not_a_repo for a plain directory", %{tmp_dir: dir} do
      assert {:error, :not_a_repo} = Git.staged_files(dir)
    end
  end

  describe "unstaged_files/1" do
    @tag :tmp_dir
    test "lists paths with unstaged changes vs the index", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "seed.txt"), "worktree edit\n")

      assert {:ok, [%{path: "seed.txt", status: :modified}]} = Git.unstaged_files(dir)
    end

    @tag :tmp_dir
    test "does not list purely-staged changes", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "seed.txt"), "staged only\n")
      git!(["add", "."], cd: dir)

      assert {:ok, []} = Git.unstaged_files(dir)
    end

    @tag :tmp_dir
    test "returns :not_a_repo for a plain directory", %{tmp_dir: dir} do
      assert {:error, :not_a_repo} = Git.unstaged_files(dir)
    end
  end

  describe "staged_file_diff/2" do
    @tag :tmp_dir
    test "returns the unified diff of the index vs HEAD for one path", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "seed.txt"), "changed\n")
      git!(["add", "."], cd: dir)

      assert {:ok, diff} = Git.staged_file_diff(dir, "seed.txt")
      assert diff =~ "-seed"
      assert diff =~ "+changed"
    end

    @tag :tmp_dir
    test "returns an empty string when the path has no staged changes", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:ok, ""} = Git.staged_file_diff(dir, "seed.txt")
    end

    @tag :tmp_dir
    test "returns :not_a_repo for a plain directory", %{tmp_dir: dir} do
      assert {:error, :not_a_repo} = Git.staged_file_diff(dir, "seed.txt")
    end
  end

  describe "unstaged_file_diff/2" do
    @tag :tmp_dir
    test "returns the unified diff of the working tree vs the index for one path",
         %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "seed.txt"), "worktree edit\n")

      assert {:ok, diff} = Git.unstaged_file_diff(dir, "seed.txt")
      assert diff =~ "-seed"
      assert diff =~ "+worktree edit"
    end

    @tag :tmp_dir
    test "returns an empty string when the path has no unstaged changes", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:ok, ""} = Git.unstaged_file_diff(dir, "seed.txt")
    end

    @tag :tmp_dir
    test "returns :not_a_repo for a plain directory", %{tmp_dir: dir} do
      assert {:error, :not_a_repo} = Git.unstaged_file_diff(dir, "seed.txt")
    end
  end

  describe "diff_stats/3" do
    @tag :tmp_dir
    test "counts added and deleted lines per file", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "a.txt"), "one\ntwo\nthree\n")
      File.write!(Path.join(dir, "b.txt"), "keep\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "add a/b")

      git!(["checkout", "-q", "-b", "topic"], cd: dir)
      File.write!(Path.join(dir, "a.txt"), "one\nTWO\nTHREE\nfour\n")
      File.write!(Path.join(dir, "c.txt"), "brand\nnew\n")
      git!(["add", "-A"], cd: dir)
      commit!(dir, "modify a, add c")

      assert {:ok, stats} = Git.diff_stats(dir, "main", "topic")

      assert stats == %{
               "a.txt" => %{added: 3, deleted: 2},
               "c.txt" => %{added: 2, deleted: 0}
             }
    end

    @tag :tmp_dir
    test "reports nil counts for binary files", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")

      git!(["checkout", "-q", "-b", "topic"], cd: dir)
      # A 4-byte binary blob with a NUL forces git to detect it as binary.
      File.write!(Path.join(dir, "logo.bin"), <<0, 1, 2, 3>>)
      git!(["add", "logo.bin"], cd: dir)
      commit!(dir, "add binary")

      assert {:ok, stats} = Git.diff_stats(dir, "main", "topic")
      assert stats["logo.bin"] == %{added: nil, deleted: nil}
    end

    @tag :tmp_dir
    test "keys renames by the new-side path", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      File.write!(Path.join(dir, "old.txt"), "alpha\nbeta\ngamma\ndelta\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "seed old")

      git!(["checkout", "-q", "-b", "topic"], cd: dir)
      git!(["mv", "old.txt", "new.txt"], cd: dir)
      # Touch a line so numstat has non-zero counts for the rename.
      File.write!(Path.join(dir, "new.txt"), "alpha\nBETA\ngamma\ndelta\n")
      git!(["add", "-A"], cd: dir)
      commit!(dir, "rename + edit")

      assert {:ok, stats} = Git.diff_stats(dir, "main", "topic")
      assert Map.has_key?(stats, "new.txt")
      refute Map.has_key?(stats, "old.txt")
    end

    @tag :tmp_dir
    test "returns :ref_not_found for an unknown ref", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :ref_not_found} = Git.diff_stats(dir, "main", "nope")
    end

    @tag :tmp_dir
    test "rejects refs that look like options", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :invalid_ref} = Git.diff_stats(dir, "--evil", "main")
    end
  end

  describe "rev_parse/2" do
    @tag :tmp_dir
    test "resolves a branch to its 40-character commit SHA", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")

      assert {:ok, sha} = Git.rev_parse(dir, "main")
      assert is_binary(sha)
      assert byte_size(sha) == 40
      assert sha =~ ~r/^[0-9a-f]{40}$/
    end

    @tag :tmp_dir
    test "resolves an unrelated ref to a different SHA after the branch advances",
         %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:ok, before_sha} = Git.rev_parse(dir, "main")

      File.write!(Path.join(dir, "next.txt"), "next\n")
      git!(["add", "."], cd: dir)
      commit!(dir, "advance main")

      assert {:ok, after_sha} = Git.rev_parse(dir, "main")
      refute after_sha == before_sha
    end

    @tag :tmp_dir
    test "returns :ref_not_found for an unknown ref", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :ref_not_found} = Git.rev_parse(dir, "no-such-ref")
    end

    @tag :tmp_dir
    test "rejects refs that look like options", %{tmp_dir: dir} do
      init_repo!(dir, branch: "main")
      assert {:error, :invalid_ref} = Git.rev_parse(dir, "--evil")
    end

    @tag :tmp_dir
    test "returns :not_a_repo for a plain directory", %{tmp_dir: dir} do
      assert {:error, :not_a_repo} = Git.rev_parse(dir, "main")
    end
  end

  describe "trap_exit isolation" do
    @tag :tmp_dir
    test "git subprocess Port exit never leaks into a trap_exit caller", %{tmp_dir: dir} do
      # Regression: when `Suikou.Git` ran `System.cmd` inline, the OS-process
      # Port was linked to the caller. A `trap_exit` GenServer (like
      # `Musubi.Page.Server`) received `{:EXIT, port, :normal}` and crashed
      # Musubi 0.8.0's port-unaware exit logger, disconnecting the store.
      init_repo!(dir, branch: "main")
      parent = self()

      worker =
        spawn(fn ->
          Process.flag(:trap_exit, true)
          result = Git.list_branches(dir)

          leaked =
            receive do
              {:EXIT, _from, _reason} = msg -> msg
            after
              200 -> :none
            end

          send(parent, {:done, result, leaked, Process.alive?(self())})
        end)

      ref = Process.monitor(worker)

      assert_receive {:done, {:ok, ["main"]}, :none, true}, 5_000
      assert_receive {:DOWN, ^ref, :process, ^worker, :normal}, 1_000
    end
  end

  describe "env/0" do
    test "neutralizes config + GIT_DIR/work-tree/index/object-dir overrides" do
      env = Map.new(Git.env())

      for key <- ~w(GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY) do
        assert Map.fetch(env, key) == {:ok, nil}, "#{key} must be unset"
      end

      assert env["GIT_CONFIG_GLOBAL"] == "/dev/null"
      assert env["GIT_CONFIG_SYSTEM"] == "/dev/null"
    end
  end

  defp init_repo!(dir, opts \\ []) do
    branch = Keyword.get(opts, :branch, "main")
    File.mkdir_p!(dir)
    git!(["init", "-q", "-b", branch, "."], cd: dir)
    File.write!(Path.join(dir, "seed.txt"), "seed\n")
    git!(["add", "."], cd: dir)
    commit!(dir, "seed", Keyword.take(opts, [:date]))
  end

  defp commit!(dir, message, opts \\ []) do
    git!(["commit", "-q", "-m", message], Keyword.put(opts, :cd, dir))
  end

  defp git!(args, opts \\ []) do
    cd = Keyword.get(opts, :cd, File.cwd!())
    date = Keyword.get(opts, :date)

    env = [
      {"GIT_AUTHOR_NAME", "Test"},
      {"GIT_AUTHOR_EMAIL", "test@example.com"},
      {"GIT_COMMITTER_NAME", "Test"},
      {"GIT_COMMITTER_EMAIL", "test@example.com"},
      {"GIT_CONFIG_GLOBAL", "/dev/null"},
      {"GIT_CONFIG_SYSTEM", "/dev/null"}
      | if(date, do: [{"GIT_AUTHOR_DATE", date}, {"GIT_COMMITTER_DATE", date}], else: [])
    ]

    case System.cmd("git", args, cd: cd, env: env, stderr_to_stdout: true) do
      {_out, 0} -> :ok
      {out, code} -> raise "git #{Enum.join(args, " ")} failed (#{code}): #{out}"
    end
  end
end

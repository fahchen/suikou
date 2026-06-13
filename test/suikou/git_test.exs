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
    commit!(dir, "seed")
  end

  defp commit!(dir, message) do
    git!(["commit", "-q", "-m", message], cd: dir)
  end

  defp git!(args, opts \\ []) do
    cd = Keyword.get(opts, :cd, File.cwd!())

    env = [
      {"GIT_AUTHOR_NAME", "Test"},
      {"GIT_AUTHOR_EMAIL", "test@example.com"},
      {"GIT_COMMITTER_NAME", "Test"},
      {"GIT_COMMITTER_EMAIL", "test@example.com"},
      {"GIT_CONFIG_GLOBAL", "/dev/null"},
      {"GIT_CONFIG_SYSTEM", "/dev/null"}
    ]

    case System.cmd("git", args, cd: cd, env: env, stderr_to_stdout: true) do
      {_out, 0} -> :ok
      {out, code} -> raise "git #{Enum.join(args, " ")} failed (#{code}): #{out}"
    end
  end
end

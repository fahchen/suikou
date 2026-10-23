defmodule SuikouWeb.Stores.FileStoreTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Musubi.Socket
  alias Suikou.Repo
  alias Suikou.Reviews
  alias Suikou.Rounds
  alias Suikou.Schemas.Anchor.DiffHunk
  alias Suikou.Schemas.Comment
  alias SuikouWeb.Stores.FileStore

  describe "disk_token" do
    test "is nil when the file has no resolved absolute path" do
      socket = %Socket{assigns: %{path: "x"}}
      assert %{disk_token: nil} = FileStore.render(socket)
    end

    test "reflects the file's mtime and size when the path exists" do
      dir = tmp_dir()
      File.write!(Path.join(dir, "a.ex"), "one")

      socket = %Socket{assigns: %{path: "a.ex", abs_path: Path.join(dir, "a.ex")}}
      assert %{disk_token: token} = FileStore.render(socket)
      assert is_binary(token)

      # A disk change (new size) yields a new token, which is what marks the
      # client's open content stale.
      File.write!(Path.join(dir, "a.ex"), "one two three")
      assert %{disk_token: changed} = FileStore.render(socket)
      assert changed != token
    end

    test "a disk_changed update keeps the socket for a plain re-render" do
      socket = %Socket{assigns: %{path: "x", abs_path: nil}}
      assert {:ok, ^socket} = FileStore.update(%{disk_changed: true}, socket)
    end
  end

  describe "add_comment" do
    @describetag :tmp_dir
    setup :prepended_diff

    test "captures a diff hunk's quote from the lens the reviewer read",
         %{socket: socket, round: round, first: first} do
      payload = %{
        "scope" => "located",
        "critique_type" => "note",
        "body" => "this line",
        "anchor" => %{"type" => "diff_hunk", "side" => "new", "start_line" => 1, "end_line" => 1},
        "lens" => "scope=commits:#{first}"
      }

      assert {:noreply, _socket} = FileStore.handle_command(:add_comment, payload, socket)
      assert [%Comment{round_id: round_id, anchor: %DiffHunk{quote: "one"}}] = Repo.all(Comment)
      assert ^round_id = round.id
    end

    test "rejects the comment when its lens is invalid", %{socket: socket} do
      payload = %{
        "scope" => "located",
        "critique_type" => "note",
        "body" => "this line",
        "anchor" => %{"type" => "diff_hunk", "side" => "new", "start_line" => 1, "end_line" => 1},
        "lens" => "view=stack&worktree=staged"
      }

      assert {:noreply, _socket} = FileStore.handle_command(:add_comment, payload, socket)
      assert [] = Repo.all(Comment)
    end
  end

  # A diff review whose `topic` adds a.txt ("one", "two") and then prepends
  # "zero", with the file opened: new-side line 1 differs between the first
  # commit and the head.
  defp prepended_diff(%{tmp_dir: dir}) do
    git!(dir, ["init", "-q", "-b", "main", "."])
    File.write!(Path.join(dir, "seed.txt"), "seed\n")
    git!(dir, ["add", "."])
    git!(dir, ["commit", "-q", "-m", "seed"])
    git!(dir, ["checkout", "-q", "-b", "topic"])
    File.write!(Path.join(dir, "a.txt"), "one\ntwo\n")
    git!(dir, ["add", "."])
    git!(dir, ["commit", "-q", "-m", "add a"])
    File.write!(Path.join(dir, "a.txt"), "zero\none\ntwo\n")
    git!(dir, ["commit", "-q", "-am", "prepend"])

    {:ok, review} =
      Reviews.create_diff_review(insert(:project), %{
        project_path: dir,
        name: "Diff",
        base_ref: "main",
        head_ref: "topic"
      })

    {:ok, [_second, %{sha: first}]} = Reviews.list_diff_commits(review)
    {:ok, artifact} = Reviews.open_file(review, "a.txt")
    socket = %Socket{assigns: %{review_id: review.id, path: "a.txt", artifact_id: artifact.id}}

    %{socket: socket, round: Rounds.latest(artifact.id), first: first}
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

  defp tmp_dir do
    dir = Path.join(System.tmp_dir!(), "file_store_test_#{System.unique_integer([:positive])}")
    File.mkdir_p!(dir)
    on_exit(fn -> File.rm_rf!(dir) end)
    dir
  end
end

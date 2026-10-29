defmodule SuikouWeb.CLI.HTTPStub do
  @moduledoc """
  A deterministic stand-in for `SuikouWeb.CLI.HTTP` in tests: every call lands in
  the test process's mailbox (the CLI runs synchronously in the same process),
  and each route answers from the reply queue the test set in the process
  dictionary, one reply per call, falling back to a bare `200 {}`.
  """

  def post(port, path, token, body, timeout) do
    send(
      self(),
      {:cli_post, %{port: port, path: path, token: token, body: body, timeout: timeout}}
    )

    n = Process.get({:cli_call_n, path}, 0)
    Process.put({:cli_call_n, path}, n + 1)

    replies = Process.get({:cli_replies, path}, [])
    Enum.at(replies, n) || {:ok, 200, "{}"}
  end
end

defmodule SuikouWeb.CLITest do
  @moduledoc """
  Drives `SuikouWeb.CLI.run/1` with a stub transport: payload building, printing,
  exit codes, the poll loop, and the usage errors — the E2E test in
  `SuikouWeb.CLIEndToEndTest` drives the real socket.
  """

  use ExUnit.Case, async: false

  import ExUnit.CaptureIO

  alias SuikouWeb.CLI
  alias SuikouWeb.CLI.Access

  setup do
    dir = Path.join(System.tmp_dir!(), "suikou-cli-test-#{System.unique_integer([:positive])}")
    File.mkdir_p!(dir)
    original_dir = Application.get_env(:suikou, :cli_data_dir)
    original_transport = Application.get_env(:suikou, :cli_transport)
    Application.put_env(:suikou, :cli_data_dir, dir)
    Application.put_env(:suikou, :cli_transport, {SuikouWeb.CLI.HTTPStub, :post})
    port = free_port()
    :ok = Access.write_access(port)

    on_exit(fn ->
      match?({:ok, _}, File.rm_rf(dir))

      restore(:cli_data_dir, original_dir)
      restore(:cli_transport, original_transport)
    end)

    %{dir: dir, port: port}
  end

  # A port nothing listens on: the stub transport never binds, and a fixed
  # port could collide with a real daemon on this machine.
  defp free_port do
    {:ok, socket} = :gen_tcp.listen(0, ip: {127, 0, 0, 1})
    {:ok, port} = :inet.port(socket)
    :gen_tcp.close(socket)
    port
  end

  defp restore(key, nil), do: Application.delete_env(:suikou, key)
  defp restore(key, value), do: Application.put_env(:suikou, key, value)

  # Runs the CLI with stdout and stderr captured; returns {printed, exit_code}.
  defp cli(argv) do
    out =
      capture_io(fn ->
        err = capture_io(:stderr, fn -> send(self(), {:cli_exit, CLI.run(argv)}) end)
        send(self(), {:cli_err, err})
      end)

    assert_received {:cli_exit, code}
    assert_received {:cli_err, err}
    {out <> err, code}
  end

  defp last_post do
    assert_received {:cli_post, post}
    post
  end

  defp replies(path, list), do: Process.put({:cli_replies, path}, list)

  describe "a verb round trip" do
    test "posts the payload with the token and prints the JSON line, exit 0", %{port: port} do
      replies("/api/cli/project/list", [{:ok, 200, Jason.encode!(%{projects: [%{name: "Docs"}]})}])

      {out, code} = cli(["project", "list"])

      assert code == 0

      post = last_post()
      assert post.path == "/api/cli/project/list"
      assert post.port == port
      assert post.token == Access.token()
      assert Jason.decode!(post.body) == %{}

      assert %{"projects" => [%{"name" => "Docs"}]} = Jason.decode!(out)
    end

    test "re-encodes non-ASCII as \\uXXXX, byte-identical to the rpc line" do
      replies("/api/cli/project/list", [{:ok, 200, ~s({"note":"em—dash"})}])

      {out, code} = cli(["project", "list"])

      assert code == 0
      assert out =~ "\\u2014"
      assert Enum.all?(:binary.bin_to_list(out), &(&1 < 128))
    end

    test "merges the agent identity into the payload" do
      replies("/api/cli/comment/resolve", [{:ok, 200, "{}"}])

      {_out, code} = cli(["comment", "resolve", "0192", "--as", "Codex", "--icon", "🤖"])

      assert code == 0

      assert Jason.decode!(last_post().body) == %{
               "comment_id" => "0192",
               "as" => "Codex",
               "icon" => "🤖"
             }
    end

    test "reads the body from --body-file and stdin last" do
      body_path =
        Path.join(System.tmp_dir!(), "suikou-cli-body-#{System.unique_integer([:positive])}")

      File.write!(body_path, "from file")
      on_exit(fn -> File.rm(body_path) end)

      replies("/api/cli/comment/reply", [{:ok, 200, "{}"}])
      {_out, code} = cli(["comment", "reply", "c1", "--as", "A", "--body-file", body_path])
      assert code == 0
      assert %{"body" => "from file"} = Jason.decode!(last_post().body)

      replies("/api/cli/comment/reply", [{:ok, 200, "{}"}])

      out =
        capture_io([input: "from stdin"], fn ->
          err =
            capture_io(:stderr, fn ->
              send(self(), {:cli_exit, CLI.run(["comment", "reply", "c1", "--as", "A"])})
            end)

          send(self(), {:cli_err, err})
        end)

      assert_received {:cli_exit, 0}
      assert_received {:cli_err, ""}
      assert out == "{}\n"
      assert %{"body" => "from stdin"} = Jason.decode!(last_post().body)
    end
  end

  describe "payload building" do
    test "review list prefers --project, then --path, then the working directory" do
      replies("/api/cli/review/list", [{:ok, 200, "{}"}])
      {_out, 0} = cli(["review", "list", "--project", "p1"])
      assert %{"project_id" => "p1"} = Jason.decode!(last_post().body)

      {_out, 0} = cli(["review", "list", "--path", "relative/dir"])
      assert %{"path" => path} = Jason.decode!(last_post().body)
      assert Path.type(path) == :absolute

      {_out, 0} = cli(["review", "list"])
      assert %{"path" => cwd} = Jason.decode!(last_post().body)
      assert cwd == File.cwd!()
    end

    test "review create takes files or --diff base..head, with --stack only on a diff" do
      replies("/api/cli/review/create", [{:ok, 200, "{}"}])

      {_out, 0} = cli(["review", "create", "--name", "Spec", "lib", "doc.md"])

      assert %{"name" => "Spec", "selections" => ["lib", "doc.md"]} =
               payload = Jason.decode!(last_post().body)

      assert payload["project_path"] == File.cwd!()

      {_out, 0} =
        cli([
          "review",
          "create",
          "--name",
          "Diff",
          "--diff",
          "main..topic",
          "--stack",
          "topic-review"
        ])

      assert %{"base_ref" => "main", "head_ref" => "topic", "stack_ref" => "topic-review"} =
               Jason.decode!(last_post().body)

      {out, 1} = cli(["review", "create", "--name", "X", "--diff", "bad"])
      assert out =~ "invalid --diff bad; expected base..head"

      {out, 1} = cli(["review", "create", "--name", "X", "a.txt", "--diff", "main..t"])
      assert out =~ "give either files or --diff, not both"

      {out, 1} = cli(["review", "create", "--name", "X"])
      assert out =~ "expected file args or --diff base..head"
    end

    test "rounds and until-round decode to the backend shapes" do
      replies("/api/cli/review/export", [{:ok, 200, "{}"}, {:ok, 200, "{}"}, {:ok, 200, "{}"}])

      {_out, 0} = cli(["review", "export", "r1", "--rounds", "3"])
      assert %{"rounds" => [3, 3]} = Jason.decode!(last_post().body)

      {_out, 0} = cli(["review", "export", "r1", "--rounds", "2-5"])
      assert %{"rounds" => [2, 5]} = Jason.decode!(last_post().body)

      {_out, 0} = cli(["review", "export", "r1", "--all"])
      assert %{"rounds" => "all"} = Jason.decode!(last_post().body)

      {out, 1} = cli(["review", "export", "r1", "--all", "--rounds", "2"])
      assert out =~ "--all and --rounds are mutually exclusive"

      {out, 1} = cli(["review", "export", "r1", "--rounds", "5-2"])
      assert out =~ "invalid --rounds 5-2"

      replies("/api/cli/review/wait", [{:ok, 200, "{}"}])
      {_out, 0} = cli(["review", "wait", "r1", "--until-round", "2"])
      assert %{"until_round" => 2} = Jason.decode!(last_post().body)
    end

    test "comment add builds the anchor, scope, and critique type" do
      replies("/api/cli/comment/add", [{:ok, 200, "{}"}])

      {_out, 0} =
        cli([
          "comment",
          "add",
          "r1",
          "--path",
          "lib/a.ex",
          "--line",
          "12-14",
          "--as",
          "A",
          "--body",
          "x"
        ])

      assert %{
               "scope" => "located",
               "critique_type" => "note",
               "anchor" => %{"type" => "line_range", "start_line" => 12, "end_line" => 14}
             } =
               Jason.decode!(last_post().body)

      {_out, 0} =
        cli([
          "comment",
          "add",
          "r1",
          "--path",
          "lib/a.ex",
          "--hunk",
          "new:3-9",
          "--as",
          "A",
          "--body",
          "x"
        ])

      assert %{"anchor" => %{"type" => "diff_hunk", "side" => "new"}} =
               Jason.decode!(last_post().body)

      {_out, 0} =
        cli([
          "comment",
          "add",
          "r1",
          "--path",
          "lib/a.ex",
          "--review-wide",
          "--as",
          "A",
          "--body",
          "x"
        ])

      body = Jason.decode!(last_post().body)
      assert body["scope"] == "review"
      refute Map.has_key?(body, "anchor")

      {out, 1} =
        cli([
          "comment",
          "add",
          "r1",
          "--path",
          "lib/a.ex",
          "--type",
          "rant",
          "--as",
          "A",
          "--body",
          "x"
        ])

      assert out =~ "invalid --type rant"
    end

    test "react takes exactly one emoji positional" do
      replies("/api/cli/comment/react", [{:ok, 200, "{}"}])

      {_out, 0} = cli(["comment", "react", "c1", "👀", "--as", "A"])
      assert %{"emoji" => "👀"} = Jason.decode!(last_post().body)

      {out, 1} = cli(["comment", "react", "c1", "--as", "A"])
      assert out =~ "expected exactly one emoji"
    end
  end

  describe "exit codes" do
    test "a domain error in the JSON keeps exit 0 unless the verb opted in" do
      error = Jason.encode!(%{error: "review_not_found"})
      replies("/api/cli/review/show", [{:ok, 200, error}])
      {out, 0} = cli(["review", "show", "r1"])
      assert %{"error" => "review_not_found"} = Jason.decode!(out)

      replies("/api/cli/review/set-stack", [{:ok, 200, error}])
      {_out, 1} = cli(["review", "set-stack", "r1", "topic"])

      stack_error = Jason.encode!(%{error: "stack_not_equivalent: lib/a.ex"})
      replies("/api/cli/review/create", [{:ok, 200, stack_error}])
      {_out, 1} = cli(["review", "create", "--name", "D", "--diff", "a..b", "--stack", "s"])
    end

    test "a rejected token fails with a clear message" do
      replies("/api/cli/project/list", [{:ok, 401, "{}"}])
      {out, 1} = cli(["project", "list"])
      assert out =~ "unauthorized"
    end

    test "a missing access file reports that Suikou is not running" do
      File.rm!(Path.join(Access.data_dir(), "cli.json"))

      {out, 1} = cli(["project", "list"])
      assert out =~ "Suikou is not running"
    end

    test "a usage error prints the message and exits 1" do
      {out, 1} = cli(["review", "show"])
      assert out =~ "missing required <review-id>"

      {out, 1} = cli(["project", "frobnicate"])
      assert out =~ "unknown command"

      {out, 1} = cli(["review", "show", "r1", "--nope", "1"])
      assert out =~ "unknown option --nope"
    end
  end

  describe "review wait" do
    test "re-issues until a non-timeout answer, passing the remaining budget" do
      timeout = Jason.encode!(%{status: "timeout", submission_version: 1})
      snapshot = Jason.encode!(%{review_id: "r1", submission_version: 2})

      replies("/api/cli/review/wait", [
        {:ok, 200, timeout},
        {:ok, 200, timeout},
        {:ok, 200, snapshot}
      ])

      {out, 0} = cli(["review", "wait", "r1", "--timeout", "0.2"])

      assert %{"submission_version" => 2} = Jason.decode!(out)

      # Every round carries a deadline budget: the transport timeout is the
      # remaining budget plus slack, and the payload passes the budget itself.
      assert_received {:cli_post, %{timeout: t1, body: b1}}
                      when is_integer(t1) and t1 <= 205_000 + 5_000

      assert %{"timeout_ms" => ms1} = Jason.decode!(b1)
      assert ms1 <= 200
      assert_received {:cli_post, %{timeout: t2}} when is_integer(t2) and t2 >= 5_000
      assert_received {:cli_post, %{}}
    end

    test "prints the last timeout line when --timeout elapses, exit 0" do
      timeout = Jason.encode!(%{status: "timeout", submission_version: 1})
      replies("/api/cli/review/wait", [{:ok, 200, timeout}])

      # A zero budget answers with this round's timeout line at once.
      {out, 0} = cli(["review", "wait", "r1", "--timeout", "0"])

      assert %{"status" => "timeout"} = Jason.decode!(out)
    end
  end

  describe "boot entry" do
    # The plain arguments of `:init` as the one-file executable boots the
    # release: `-extra --no-halt -- <args>`.
    test "a CLI word after the bare `--` runs the CLI" do
      assert CLI.entry([~c"--no-halt", ~c"--", ~c"help"]) == {:cli, ["help"]}

      assert CLI.entry([~c"--no-halt", ~c"--", ~c"review", ~c"show", ~c"--", ~c"r1"]) ==
               {:cli, ["review", "show", "--", "r1"]}
    end

    test "an argument keeps its Unicode characters" do
      assert CLI.entry([~c"--no-halt", ~c"--", ~c"comment", ~c"react", ~c"c1", ~c"👀"]) ==
               {:cli, ["comment", "react", "c1", "👀"]}
    end

    test "no arguments boots the server and opens the browser" do
      assert CLI.entry([~c"--no-halt"]) == {:server, true}
    end

    test "run boots the server without the browser" do
      assert CLI.entry([~c"--no-halt", ~c"--", ~c"run"]) == {:server, false}
    end
  end

  describe "lifecycle and help" do
    test "version prints the application version" do
      {out, 0} = cli(["version"])
      assert out =~ to_string(Application.spec(:suikou, :vsn))
    end

    test "help prints the whole usage and one verb's line" do
      {out, 0} = cli(["help"])
      assert out =~ "usage: suikou <command>"
      assert out =~ "project list"

      {out, 0} = cli(["help", "review", "wait"])
      assert out =~ "usage: suikou review wait"
    end

    test "skill prints the embedded markdown and writes it with --output" do
      {out, 0} = cli(["skill"])
      assert out =~ "name: suikou"

      target =
        Path.join(
          System.tmp_dir!(),
          "suikou-skill-#{System.unique_integer([:positive])}/SKILL.md"
        )

      on_exit(fn -> match?({:ok, _}, File.rm_rf(Path.dirname(target))) end)

      {out, 0} = cli(["skill", "--output", target])
      assert String.trim(out) == target
      assert File.read!(target) =~ "name: suikou"

      {out, 1} = cli(["skill", "--output", target])
      assert out =~ "already exists; pass --force"
    end

    test "stop waits for the server to vanish and reports not running" do
      replies("/api/cli/server/stop", [{:ok, 200, "{}"}])
      # The port never listens (the stub does not bind), so it is already gone.
      {out, 0} = cli(["stop"])
      assert out =~ "stopped"

      File.rm!(Path.join(Access.data_dir(), "cli.json"))
      {out, 0} = cli(["stop"])
      assert out =~ "not running"
    end

    test "status reports the pid and the port state", %{port: port} do
      replies("/api/cli/server/pid", [{:ok, 200, Jason.encode!(%{pid: "123", error: nil})}])
      {out, 0} = cli(["status"])
      assert out =~ "starting (pid 123), port #{port} not yet reachable"
    end

    test "start without a packaged release fails clearly" do
      System.delete_env("PBEAM_EXECUTABLE")
      System.delete_env("SUIKOU_EXECUTABLE")
      System.delete_env("RELEASE_ROOT")

      {out, 1} = cli(["start"])
      assert out =~ "needs the packaged release"
    end
  end
end

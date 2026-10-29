defmodule SuikouWeb.CLIDaemonTest do
  @moduledoc """
  Drives the `start`, `status`, and `stop` lifecycle of the CLI end to end,
  with each part in its own OS process as in a packaged install: the CLI runs
  in a new `elixir` process on the test build, and `start` detaches a fake
  one-file executable that boots the real application as the server (see
  `test/support/cli_daemon.exs`). Each process gets its environment from
  `System.cmd/3`, so the test changes no environment of the test node.
  """

  # Not async: the two BEAM boots of each run load the CPU, and the async
  # tests with short receive windows (the file watcher) must not share it.
  use ExUnit.Case, async: false

  @daemon_script Path.expand("../support/cli_daemon.exs", __DIR__)

  # The CLI's own boot: the CLI needs `Req`, not the application.
  @cli_eval "{:ok, _} = Application.ensure_all_started(:req); System.halt(SuikouWeb.CLI.run(System.argv()))"

  setup do
    dir = Path.join(System.tmp_dir!(), "suikou-cli-daemon-#{System.unique_integer([:positive])}")
    data_dir = Path.join(dir, "data")
    bin_dir = Path.join(dir, "bin")
    File.mkdir_p!(data_dir)
    File.mkdir_p!(bin_dir)

    elixir = System.find_executable("elixir")
    executable = Path.join(bin_dir, "suikou")
    opened = Path.join(dir, "opened")

    # The fake one-file executable: it boots the real application from the
    # test build, as the release boot of `suikou run` does.
    write_script!(
      executable,
      ~s(RELEASE_NAME=suikou exec "#{elixir}" "#{@daemon_script}" -- "$@")
    )

    # A fake `open` that records each URL, so the test counts the browser opens.
    write_script!(Path.join(bin_dir, "open"), ~s(printf '%s\\n' "$1" >> "#{opened}"))

    env = [
      {"ERL_LIBS", Path.dirname(:code.lib_dir(:suikou))},
      {"PATH", bin_dir <> ":" <> System.get_env("PATH")},
      {"PORT", Integer.to_string(free_port())},
      {"SUIKOU_DATA_DIR", data_dir},
      {"SUIKOU_TEST_OWNER", System.pid()},
      {"PBEAM_EXECUTABLE", executable},
      {"RELEASE_ROOT", nil},
      {"RELEASE_NAME", nil},
      {"SUIKOU_DAEMON", nil}
    ]

    on_exit(fn ->
      # A failed assertion can leave the server running; end it.
      with {:ok, pid} <- File.read(Path.join(data_dir, "suikou.pid")) do
        System.cmd("kill", [String.trim(pid)], stderr_to_stdout: true)
      end

      File.rm_rf!(dir)
    end)

    %{data_dir: data_dir, elixir: elixir, env: env, opened: opened}
  end

  @tag timeout: 120_000
  test "start detaches the server, status and stop drive it over HTTP", context do
    pid_file = Path.join(context.data_dir, "suikou.pid")
    port = context.env |> List.keyfind("PORT", 0) |> elem(1)
    url = "http://localhost:#{port}"

    assert {"not running\n", 0} = cli(context, ["status"])

    # `start` returns once the server answers, and the server outlives it.
    assert {out, 0} = cli(context, ["start"])
    assert out =~ "started at #{url}"

    # The server writes its pid file right after its endpoint starts.
    assert eventually(fn -> File.exists?(pid_file) end)
    pid = pid_file |> File.read!() |> String.trim()
    assert {status, 0} = cli(context, ["status"])
    assert status == "running (pid #{pid}) at #{url}\n"

    assert {list, 0} = cli(context, ["project", "list"])
    assert Jason.decode!(list) == %{"projects" => []}

    # `start` opened the board once; the server it detached opens nothing.
    Process.sleep(500)
    assert File.read!(context.opened) == url <> "\n"

    assert {"stopped\n", 0} = cli(context, ["stop"])
    refute File.exists?(pid_file)
    assert {"not running\n", 0} = cli(context, ["status"])

    assert {_out, 0} = cli(context, ["start", "--no-open"])
    assert File.read!(context.opened) == url <> "\n"
    assert {"stopped\n", 0} = cli(context, ["stop"])
  end

  # `start` waits 20 seconds for the port, then reports the server as not
  # ready, as it does when the detached server fails to boot.
  @tag timeout: 60_000
  test "start gives up when the detached server never serves", context do
    executable = context.env |> List.keyfind("PBEAM_EXECUTABLE", 0) |> elem(1)
    write_script!(executable, "exit 0")

    started = System.monotonic_time(:millisecond)
    assert {out, 1} = cli(context, ["start", "--no-open"])
    assert out =~ "started but not ready yet"
    assert System.monotonic_time(:millisecond) - started < 40_000
  end

  defp eventually(check, attempts \\ 20) do
    cond do
      check.() -> true
      attempts == 0 -> false
      true -> retry(check, attempts)
    end
  end

  defp retry(check, attempts) do
    Process.sleep(100)
    eventually(check, attempts - 1)
  end

  # Runs one CLI invocation in its own OS process; returns {output, exit_code}.
  defp cli(%{elixir: elixir, env: env}, argv) do
    System.cmd(elixir, ["-e", @cli_eval, "--" | argv], env: env, stderr_to_stdout: true)
  end

  defp write_script!(path, body) do
    File.write!(path, "#!/bin/sh\n" <> body <> "\n")
    File.chmod!(path, 0o755)
  end

  defp free_port do
    {:ok, socket} = :gen_tcp.listen(0, ip: {127, 0, 0, 1})
    {:ok, port} = :inet.port(socket)
    :gen_tcp.close(socket)
    port
  end
end

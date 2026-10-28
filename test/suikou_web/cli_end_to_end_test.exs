defmodule SuikouWeb.CLIEndToEndTest do
  @moduledoc """
  Drives `SuikouWeb.CLI.run/1` with the real gen_tcp transport against a real
  Bandit listener on the endpoint: the token gate, the HTTP exchange, and the
  printed JSON line, all end to end.
  """

  use SuikouWeb.ConnCase, async: false

  import ExUnit.CaptureIO
  import Suikou.Factory

  alias Suikou.Repo
  alias SuikouWeb.CLI
  alias SuikouWeb.CLI.Access

  setup do
    dir = Path.join(System.tmp_dir!(), "suikou-cli-e2e-#{System.unique_integer([:positive])}")
    File.mkdir_p!(dir)

    original_dir = Application.get_env(:suikou, :cli_data_dir)
    original_transport = Application.get_env(:suikou, :cli_transport)
    Application.put_env(:suikou, :cli_data_dir, dir)
    Application.delete_env(:suikou, :cli_transport)

    # The endpoint serves in Bandit's process tree, outside the test process,
    # so the sandbox checkout must be shared with it.
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})

    port = free_port()

    start_link_supervised!(
      {Bandit, plug: SuikouWeb.Endpoint, scheme: :http, ip: {127, 0, 0, 1}, port: port}
    )

    :ok = Access.write_access(port)

    on_exit(fn ->
      match?({:ok, _}, File.rm_rf(dir))

      case original_dir do
        nil -> Application.delete_env(:suikou, :cli_data_dir)
        value -> Application.put_env(:suikou, :cli_data_dir, value)
      end

      case original_transport do
        nil -> :ok
        value -> Application.put_env(:suikou, :cli_transport, value)
      end
    end)

    :ok
  end

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

  test "a verb drives the real socket end to end" do
    insert(:project, name: "Docs")

    {out, 0} = cli(["project", "list"])

    assert %{"projects" => [%{"name" => "Docs"}]} = Jason.decode!(out)
  end

  test "a wrong token over the real socket is rejected" do
    File.write!(
      Path.join(Access.data_dir(), "cli.json"),
      Jason.encode!(%{port: port_of(), token: "not-the-token"})
    )

    {out, 1} = cli(["project", "list"])
    assert out =~ "unauthorized"
  end

  # The real `stop` route stops the node it runs on, which in this suite is
  # the test node itself, so the E2E drives the pid route instead; the stop
  # round trip and its wait are covered against the stub transport.
  test "pid answers over the real socket" do
    {out, 0} = cli(["status"])
    assert out =~ "running"
    assert out =~ List.to_string(:os.getpid())
  end

  defp free_port do
    {:ok, socket} = :gen_tcp.listen(0, ip: {127, 0, 0, 1})
    {:ok, port} = :inet.port(socket)
    :gen_tcp.close(socket)
    port
  end

  defp port_of do
    {:ok, %{port: port}} = Access.fetch()
    port
  end
end

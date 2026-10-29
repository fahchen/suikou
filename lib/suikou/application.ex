defmodule Suikou.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information about OTP Applications
  @moduledoc false

  use Application

  require Logger

  @impl Application
  def start(_type, _args) do
    if release_boot?() do
      case SuikouWeb.CLI.entry(:init.get_plain_arguments()) do
        {:cli, argv} -> run_cli(argv)
        {:server, open_browser?} -> boot_server(open_browser?)
      end
    else
      # `mix phx.server` and the test boot always serve; the CLI runs through
      # `mix run` in dev (see the `cli` mise task).
      boot_server(false)
    end
  end

  # A release boot dispatches on the executable's arguments: a CLI word runs
  # the CLI instead of the server (see `SuikouWeb.CLI.entry/1`).
  defp release_boot?, do: System.get_env("RELEASE_NAME") != nil

  # The CLI is a short-lived client: run it, then stop the node with its exit
  # code. The task parks afterwards so the application master never sees it
  # die before the shutdown it started has run.
  defp run_cli(argv) do
    Task.start(fn ->
      System.stop(SuikouWeb.CLI.run(argv))
      Process.sleep(:infinity)
    end)
  end

  defp boot_server(open_browser?) do
    children = [
      SuikouWeb.Telemetry,
      Suikou.Repo,
      {Ecto.Migrator,
       repos: Application.fetch_env!(:suikou, :ecto_repos), skip: skip_migrations?()},
      {Phoenix.PubSub, name: Suikou.PubSub},
      # Per-review file watchers: one process per review_id, found by id and
      # ref-counted by the connected review stores (see Suikou.FileWatcher).
      {Registry, keys: :unique, name: Suikou.FileWatcher.Registry},
      {DynamicSupervisor, name: Suikou.FileWatcher.Supervisor},
      # Per-review changes cache: one process per review_id, ref-counted by the
      # connected review stores, owning the file list/hashes and per-file diff
      # content (see Suikou.ChangesWatcher).
      {Registry, keys: :unique, name: Suikou.ChangesWatcher.Registry},
      {DynamicSupervisor, name: Suikou.ChangesWatcher.Supervisor},
      # Live presence of agent CLI `wait` calls, keyed by review_id. Each blocking
      # wait registers one entry for its lifetime; the count powers the review
      # footer's "waiting" indicator. Duplicate keys: many agents wait at once.
      {Registry, keys: :duplicate, name: Suikou.WaitingRegistry},
      # Start to serve requests, typically the last entry
      SuikouWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Suikou.Supervisor]

    case Supervisor.start_link(children, opts) do
      {:ok, _pid} = ok ->
        write_cli_access()
        if open_browser?, do: open_when_ready()
        ok

      error ->
        error
    end
  end

  # The CLI reaches the server over loopback HTTP, so a booted endpoint
  # publishes the port it bound and the token that authenticates the CLI (see
  # `SuikouWeb.CLI.Access`). A boot without a server (the test endpoint, a CLI-only
  # eval) skips it; a failed write logs rather than crashes — the CLI then
  # reports that Suikou is not running, which is the truth of it.
  defp write_cli_access do
    if SuikouWeb.Endpoint.config(:server) do
      port = SuikouWeb.Endpoint.config(:http)[:port]

      case SuikouWeb.CLI.Access.write_access(port) do
        :ok ->
          :ok

        {:error, reason} ->
          Logger.warning("could not write the CLI access file: #{inspect(reason)}")
      end
    end
  end

  # The bare executable opens the board once the server actually serves, so
  # migrations that run first never open a dead page.
  defp open_when_ready do
    port = SuikouWeb.Endpoint.config(:http)[:port]

    Task.start(fn ->
      if wait_for_port(port, 20_000) do
        System.cmd("open", [SuikouWeb.CLI.url_for_port(port)])
      else
        Logger.warning("the server did not become ready at port #{port}; not opening the browser")
      end
    end)
  end

  defp wait_for_port(port, timeout_ms) do
    deadline = System.monotonic_time(:millisecond) + timeout_ms

    if SuikouWeb.CLI.up?(port) do
      true
    else
      if System.monotonic_time(:millisecond) >= deadline do
        false
      else
        Process.sleep(150)
        wait_for_port(port, timeout_ms)
      end
    end
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl Application
  def config_change(changed, _new, removed) do
    SuikouWeb.Endpoint.config_change(changed, removed)
    :ok
  end

  defp skip_migrations? do
    # By default, sqlite migrations are run when using a release
    System.get_env("RELEASE_NAME") == nil
  end
end

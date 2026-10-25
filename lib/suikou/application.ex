defmodule Suikou.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  require Logger

  @impl Application
  def start(_type, _args) do
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
    write_cli_access(Supervisor.start_link(children, opts))
  end

  # The CLI reaches the server over loopback HTTP, so a booted endpoint
  # publishes the port it bound and the token that authenticates the CLI (see
  # `Suikou.CLI.Access`). A boot without a server (the test endpoint, a CLI-only
  # eval) skips it; a failed write logs rather than crashes — the CLI then
  # reports that Suikou is not running, which is the truth of it.
  defp write_cli_access({:ok, _pid} = ok) do
    if SuikouWeb.Endpoint.config(:server) do
      port = SuikouWeb.Endpoint.config(:http)[:port]

      case Suikou.CLI.Access.write_access(port) do
        :ok ->
          :ok

        {:error, reason} ->
          Logger.warning("could not write the CLI access file: #{inspect(reason)}")
      end
    end

    ok
  end

  defp write_cli_access(other), do: other

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

defmodule Suikou.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl Application
  def start(_type, _args) do
    children = [
      SuikouWeb.Telemetry,
      Suikou.Repo,
      {Ecto.Migrator,
       repos: Application.fetch_env!(:suikou, :ecto_repos), skip: skip_migrations?()},
      {DNSCluster, query: Application.get_env(:suikou, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: Suikou.PubSub},
      # Per-review file watchers: one process per review_id, found by id and
      # ref-counted by the connected review stores (see Suikou.FileWatcher).
      {Registry, keys: :unique, name: Suikou.FileWatcher.Registry},
      {DynamicSupervisor, name: Suikou.FileWatcher.Supervisor},
      # Start to serve requests, typically the last entry
      SuikouWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Suikou.Supervisor]
    Supervisor.start_link(children, opts)
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

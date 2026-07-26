# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :suikou,
  ecto_repos: [Suikou.Repo],
  generators: [timestamp_type: :utc_datetime, binary_id: true]

config :suikou, Suikou.Repo,
  migration_primary_key: [type: :binary_id],
  migration_foreign_key: [type: :binary_id]

# Configure the endpoint
config :suikou, SuikouWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: SuikouWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Suikou.PubSub,
  live_view: [signing_salt: "pYPS2sJs"]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# `.ts` normally means a TypeScript source file in a review, not an MPEG
# transport stream. Keep every TypeScript source variant text-renderable.
config :mime, :extensions, %{
  "ts" => "text/plain",
  "tsx" => "text/plain",
  "mts" => "text/plain",
  "cts" => "text/plain"
}

# Musubi TypeScript codegen target consumed by the frontend
config :musubi, :ts_codegen_output_path, "assets/src/generated/musubi.d.ts"

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"

import Config

# Configure your database
#
# The MIX_TEST_PARTITION environment variable can be used
# to provide built-in test partitioning in CI environment.
# Run `mix help test` for more information.
config :suikou, Suikou.Repo,
  database: Path.expand("../suikou_test.db", __DIR__),
  pool_size: 5,
  pool: Ecto.Adapters.SQL.Sandbox

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :suikou, SuikouWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "yRE+/ORV1EoKTPn9rH1hZjWWaMBiZoWYQUp4dRSYN2h/h4CP2ZyFWguRuZIrrKzI",
  server: false

# Print only warnings and errors during test
config :logger, level: :warning

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true

# Keep the agent CLI poll window short so its timeout branch is exercised
# without a 25 s wait. The wake test drives a real submission within the window.
config :suikou, :agent_cli_poll_window_ms, 200

# Short grace window so Suikou.ChangesWatcher's ref-count teardown is exercised
# without a 30 s wait.
config :suikou, :changes_watcher_grace_ms, 100

# VAPID keys so Web Push code can build a payload in tests without hitting the
# network (the actual send is integration-only). Reuses the dev keypair.
config :web_push_elixir,
  vapid_public_key:
    "BLiXBMI2l2H9kAphcv5HSzv-Pl6giTrFYs7ALi6tHE1b8dpyRlkhrn_ErjXsvE3YgxP-mbUDkbKmQHmhd4N8Rwk",
  vapid_private_key: "smmCUOgWEdsYVrLJ3a3yLT1jaLF74hGsQgYfg5OTlYo",
  vapid_subject: "mailto:suikou@example.com"

# Stub the Web Push sender so Suikou.Push.notify/1 exercises its delivery and
# prune paths without any network — the stub decides by endpoint (see the module).
config :suikou, :web_push_sender, {Suikou.PushSenderStub, :send_notification}

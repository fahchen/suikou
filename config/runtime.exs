import Config

# config/runtime.exs is executed for all environments, including
# during releases. It is executed after compilation and before the
# system starts, so it is typically used to load production configuration
# and secrets from environment variables or elsewhere. Do not define
# any compile-time configuration in here, as it won't be applied.
# The block below contains prod specific runtime configuration.

# ## Using releases
#
# If you use `mix release`, you need to explicitly enable the server
# by passing the PHX_SERVER=true when you start it:
#
#     PHX_SERVER=true bin/suikou start
#
# Alternatively, you can use `mix phx.gen.release` to generate a `bin/server`
# script that automatically sets the env var above.
if System.get_env("PHX_SERVER") do
  config :suikou, SuikouWeb.Endpoint, server: true
end

if config_env() == :prod do
  # User-tunable overrides, read once at boot from an XDG-located TOML file
  # ($XDG_CONFIG_HOME/suikou/config.toml, defaulting to ~/.config/suikou/config.toml).
  # Production (the packaged release) only — dev/test never read it. A missing file
  # or key falls back to the defaults below; a present-but-malformed file fails loudly
  # so a typo can't silently leave the server on its defaults.
  config_home =
    System.get_env("XDG_CONFIG_HOME") || Path.join(System.user_home!(), ".config")

  config_path = Path.join([config_home, "suikou", "config.toml"])

  user_config =
    if File.exists?(config_path) do
      case Toml.decode_file(config_path, keys: :strings) do
        {:ok, map} -> map
        {:error, reason} -> raise "invalid Suikou config at #{config_path}: #{inspect(reason)}"
      end
    else
      %{}
    end

  database_path =
    user_config["database_path"] || System.get_env("DATABASE_PATH") ||
      raise """
      environment variable DATABASE_PATH is missing.
      For example: /etc/suikou/suikou.db
      """

  config :suikou, Suikou.Repo,
    database: database_path,
    pool_size: user_config["pool_size"] || String.to_integer(System.get_env("POOL_SIZE") || "5")

  # The secret key base is used to sign/encrypt cookies and other secrets.
  # A default value is used in config/dev.exs and config/test.exs but you
  # want to use a different value for prod and you most likely don't want
  # to check this value into version control, so we use an environment
  # variable instead.
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  host = user_config["host"] || System.get_env("PHX_HOST") || "example.com"

  config :suikou, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  # Which interfaces to listen on. Exposed as a preset rather than a raw address
  # because TOML can't express an Erlang IP tuple, and because both presets keep
  # 127.0.0.1 reachable — the launcher's liveness probe always hits 127.0.0.1.
  #   "all"      bind every interface (IPv6 ::, dual-stack; reachable over tailnet)
  #   "loopback" bind 127.0.0.1 only (this machine only; disables tailnet access)
  bind_ip =
    case user_config["bind"] || "all" do
      "all" ->
        {0, 0, 0, 0, 0, 0, 0, 0}

      "loopback" ->
        {127, 0, 0, 1}

      other ->
        raise "invalid `bind` at #{config_path}: #{inspect(other)} (expected \"all\" or \"loopback\")"
    end

  config :suikou, SuikouWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    # A tailnet peer reaches this by raw IP *or* MagicDNS name (varies per device),
    # so a fixed origin allowlist can't cover every case. Default to accepting any
    # websocket origin — a single-user app on a private, tailscale-authenticated
    # network. Set `check_origin` in config.toml (a list of "//host" strings) to
    # tighten it if the server is ever exposed beyond a trusted tailnet.
    check_origin: Map.get(user_config, "check_origin", false),
    http: [
      ip: bind_ip,
      port: String.to_integer(System.get_env("PORT") || "4000")
    ],
    secret_key_base: secret_key_base

  # ## SSL Support
  #
  # To get SSL working, you will need to add the `https` key
  # to your endpoint configuration:
  #
  #     config :suikou, SuikouWeb.Endpoint,
  #       https: [
  #         ...,
  #         port: 443,
  #         cipher_suite: :strong,
  #         keyfile: System.get_env("SOME_APP_SSL_KEY_PATH"),
  #         certfile: System.get_env("SOME_APP_SSL_CERT_PATH")
  #       ]
  #
  # The `cipher_suite` is set to `:strong` to support only the
  # latest and more secure SSL ciphers. This means old browsers
  # and clients may not be supported. You can set it to
  # `:compatible` for wider support.
  #
  # `:keyfile` and `:certfile` expect an absolute path to the key
  # and cert in disk or a relative path inside priv, for example
  # "priv/ssl/server.key". For all supported SSL configuration
  # options, see https://hexdocs.pm/plug/Plug.SSL.html#configure/1
  #
  # We also recommend setting `force_ssl` in your config/prod.exs,
  # ensuring no data is ever sent via http, always redirecting to https:
  #
  #     config :suikou, SuikouWeb.Endpoint,
  #       force_ssl: [hsts: true]
  #
  # Check `Plug.SSL` for all available options in `force_ssl`.
end

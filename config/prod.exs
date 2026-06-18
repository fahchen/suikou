import Config

# No force_ssl: this packaged app is served over plain HTTP on a private tailnet
# (no TLS anywhere), so an https redirect + HSTS would only make it unreachable
# from tailnet peers. Add force_ssl back if a TLS-terminating proxy is introduced.

# Do not print debug messages in production
config :logger, level: :info

# Runtime production configuration, including reading
# of environment variables, is done on config/runtime.exs.

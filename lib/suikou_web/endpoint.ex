defmodule SuikouWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :suikou

  # The session will be stored in the cookie and signed,
  # this means its contents can be read but not tampered with.
  # Set :encryption_salt if you would also like to encrypt it.
  @session_options [
    store: :cookie,
    key: "_suikou_key",
    signing_salt: "uq76lqK2",
    same_site: "Lax"
  ]

  socket "/socket", SuikouWeb.UserSocket,
    websocket: true,
    longpoll: false

  # Vite fingerprints every file under /assets (e.g. index-<hash>.js), so each
  # name maps to immutable content and can be cached forever. We don't run
  # phx.digest, so the default vsn-only long cache never applies — set it here.
  # Served before the general static plug so these win and skip ETag revalidation.
  plug Plug.Static,
    at: "/assets",
    from: {:suikou, "priv/static/assets"},
    gzip: not code_reloading?,
    cache_control_for_etags: "public, max-age=31536000, immutable"

  # The PWA update path: sw.js is the update trigger and index.html/manifest are
  # the unfingerprinted shell. iOS WebKit has a history of satisfying the SW
  # update check from HTTP cache, which strands installed PWAs on stale bundles —
  # force revalidation on every request so updates land on the next launch.
  plug Plug.Static,
    at: "/",
    from: :suikou,
    gzip: not code_reloading?,
    only: ~w(sw.js push-sw.js manifest.webmanifest index.html),
    cache_control_for_etags: "no-cache"

  # Serve at "/" the remaining static files from "priv/static" directory
  # (favicon.ico, robots.txt, fonts/, images/). These are not
  # fingerprinted, so they keep the default revalidating cache headers.
  plug Plug.Static,
    at: "/",
    from: :suikou,
    gzip: not code_reloading?,
    only: SuikouWeb.static_paths(),
    raise_on_missing_only: code_reloading?

  # Code reloading can be explicitly enabled under the
  # :code_reloader configuration of your endpoint.
  if code_reloading? do
    plug Phoenix.CodeReloader
    plug Phoenix.Ecto.CheckRepoStatus, otp_app: :suikou
  end

  plug Plug.RequestId
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head
  plug Plug.Session, @session_options
  plug SuikouWeb.Router
end

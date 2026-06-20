# Suikou

A human-in-the-loop code review tool: a server-authoritative Musubi runtime on
Phoenix (API + Musubi socket), a React frontend, and a single-file `suikou`
binary that an agent drives over a small CLI.

## Develop

Requires [mise](https://mise.jdx.dev) (provisions Elixir/Erlang/Bun).

```sh
mix setup        # install deps + set up the database
mise run dev     # Phoenix (distributed node, :4710) + Vite (:5173) together
mix precommit    # format, compile --warnings-as-errors, test — run before pushing
```

`mise run cli -- <args>` drives the agent CLI against the live dev node (e.g.
`mise run cli -- review list --project <id>`).

## Package & install

`mix suikou.package` builds the whole app — React frontend, a self-contained
`mix release` (ERTS bundled), and the bun launcher — into one file at
`dist/suikou`. It does **not** install; copy it onto your `PATH` and restart the
daemon so the new binary and any `config.toml` changes take effect:

```sh
mix suikou.package
suikou stop                      # if a daemon from an older build is running
cp dist/suikou ~/.local/bin/suikou
suikou start                     # boots the new binary, opens the browser
```

Lifecycle state lives in `~/Library/Application Support/Suikou` (independent of
the binary), so `stop`/`start` reach the daemon across versions. Targets the
host platform only (macOS arm64).

### Run

```sh
suikou           # foreground, opens the browser; Ctrl-C stops it
suikou start     # background daemon, opens the browser
suikou stop      # stop the daemon
suikou status    # is the daemon running, and where
suikou skill     # print the agent CLI skill markdown (no server needed)
```

## Configure

Runtime config is read once at boot from `~/.config/suikou/config.toml`
(packaged build only; dev/test ignore it). Every key is optional — see
[`config.toml.example`](config.toml.example) for the full list and defaults.
Edit, then `suikou stop && suikou start` to apply.

Common keys: `host` (Tailscale MagicDNS name for tailnet links), `url_scheme` /
`url_port` (set to `https` / `443` only behind a TLS front like
`tailscale serve`), `port` (HTTP listener, default `47100`).

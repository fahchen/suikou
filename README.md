<h1>
  <img src="priv/static/icon-192.png" alt="" width="30" align="left" />
  Suikou
</h1>

**A workbench for deliberate code review.** Read closely, anchor comments to
exact lines, set a verdict per file, submit a round, iterate.

Suikou runs as a single-file binary on your own machine and exposes a small CLI,
so an agent can open a review and hand it to you to sign off.

## Highlights

- **File-by-file verdicts.** Every file carries its own state; a round isn't done
  until each one is judged.
- **Anchored discussion.** Comments pin to exact lines and survive re-reads.
- **Two review modes.** Browse whole files, or a branch/commit diff with a live
  scope lens.
- **Server-authoritative.** A Musubi runtime on Phoenix holds the truth; the
  React frontend is a thin, realtime view that resumes instantly (PWA shell).
- **Yours, on your tailnet.** Single user, single binary, no cloud. Reachable
  from any device over Tailscale.

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

`mise run package` builds the whole app — React frontend, a self-contained
`mix release` (ERTS bundled), and the bun launcher — into one file at
`dist/suikou`. It does **not** install; copy it onto your `PATH` and restart the
daemon so the new binary and any `config.toml` changes take effect:

```sh
mise run package
suikou stop                                    # if a daemon from an older build is running
cp dist/suikou ~/.local/bin/suikou
xattr -c ~/.local/bin/suikou                   # drop provenance/quarantine xattrs
codesign --force --sign - ~/.local/bin/suikou  # re-sign ad-hoc
suikou start                                   # boots the new binary, opens the browser
```

The `xattr`/`codesign` steps matter: `cp` invalidates the bun binary's ad-hoc
signature, and macOS then **SIGKILLs the copy on exec** — a silent `Killed: 9`
with no output, before the server can even start. Re-signing the installed copy
ad-hoc makes it runnable.

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

Runtime config is read once at boot from `~/.config/suikou/config.toml` (packaged
build only; dev/test ignore it). Every key is optional and documented inline in
[`config.toml.example`](config.toml.example) — copy it, edit, then
`suikou stop && suikou start` to apply.

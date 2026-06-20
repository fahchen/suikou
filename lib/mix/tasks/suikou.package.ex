defmodule Mix.Tasks.Suikou.Package do
  @shortdoc "Builds the single-file dist/suikou executable"

  @moduledoc """
  Packages the whole app into one runnable file at `dist/suikou`.

  The build mirrors the sibling `redbug-cli` trick: a self-contained `mix release`
  (ERTS bundled) is packed and embedded into a `bun --compile` launcher that, at
  runtime, unpacks the release and boots the Phoenix server (which serves the API,
  the React SPA, and the Musubi socket same-origin).

  The launcher takes subcommands. Background lifecycle delegates to the release's
  own OTP-native commands (`bin/suikou daemon`/`stop`/`pid` via run_erl), with the
  release's `RELEASE_TMP`/`RELEASE_COOKIE`/`RELEASE_NODE`/`RELEASE_DISTRIBUTION`
  pinned to stable locations in `~/Library/Application Support/Suikou` so stop and
  status reach the daemon regardless of which binary version started it.

    * bare `suikou` — run in the foreground, opening the browser; Ctrl-C stops it.
    * `suikou start` — start the release as a background daemon, then open the
      browser. run_erl logs land in
      `~/Library/Application Support/Suikou/tmp/log`.
    * `suikou stop` — stop the running daemon.
    * `suikou status` — report whether the daemon is running.
    * `suikou run` — foreground alias (same as bare, without opening the browser).

  Steps:

    1. Build the React frontend into `priv/static` (Vite via Bun).
    2. `MIX_ENV=prod mix release suikou` with the `:tar` step → assembles
       `_build/prod/rel/suikou` and packs `_build/prod/suikou-<vsn>.tar.gz`
       via Erlang's `:erl_tar` (pure OTP, no external `tar`).
    3. Copy that tarball to `packaging/embed/server.tar.gz`.
    4. `bun build --compile packaging/launcher.ts` → `dist/suikou`. At runtime
       the launcher extracts it with `Bun.Archive` (libarchive, no external
       `tar`), preserving exec bits.

  Targets the host platform only (macOS arm64).

  ## Install

  The task only builds `dist/suikou`; it does not install. To put it on `PATH`,
  copy it to a bin directory, then restart the daemon so the new binary and any
  `config.toml` changes take effect:

      mix suikou.package
      suikou stop                 # if a daemon from an older build is running
      cp dist/suikou ~/.local/bin/suikou
      suikou start                # boots the new binary, opens the browser

  Lifecycle state lives in `~/Library/Application Support/Suikou` (independent of
  the binary), so `stop`/`start` reach the daemon across versions. Runtime config
  is read once at boot from `~/.config/suikou/config.toml`, so a config edit also
  needs `suikou stop && suikou start`.

  ## Examples

      $ mix suikou.package
      #=> packaged -> dist/suikou

  """

  use Mix.Task

  @tarball_glob "_build/prod/suikou-*.tar.gz"
  @pack "packaging/embed/server.tar.gz"
  @output "dist/suikou"

  @impl Mix.Task
  @doc """
  Runs the full packaging pipeline; ignores all arguments.

  ## Examples

      Mix.Tasks.Suikou.Package.run([])
      #=> :ok

  """
  @spec run([String.t()]) :: :ok
  def run(_args) do
    build_frontend()
    build_release()
    pack_release()
    compile_binary()

    Mix.shell().info("packaged -> #{@output}")
  end

  defp build_frontend do
    Mix.shell().info("==> building frontend")
    File.rm_rf!("priv/static/assets")
    File.rm_rf!("priv/static/index.html")

    # --no-save so packaging can't rewrite assets/bun.lock, keeping the working
    # tree clean. (--frozen-lockfile is unusable here: the `file:` musubi deps
    # make bun re-resolve and report changes on every run.)
    cmd("bun", ["install", "--no-save"], cd: "assets")
    cmd("bun", ["run", "build"], cd: "assets")
  end

  defp build_release do
    Mix.shell().info("==> building release")
    cmd("mix", ["release", "suikou", "--overwrite"], env: [{"MIX_ENV", "prod"}])
  end

  defp pack_release do
    Mix.shell().info("==> packing release")
    File.mkdir_p!(Path.dirname(@pack))

    # The `:tar` release step (erl_tar) emits a versioned tarball; the version is
    # dynamic, so glob rather than hardcode.
    tarball =
      case Path.wildcard(@tarball_glob) do
        [tarball] ->
          tarball

        [] ->
          Mix.raise("no release tarball matched #{@tarball_glob}")

        many ->
          Mix.raise(
            "multiple release tarballs matched #{@tarball_glob}: #{Enum.join(many, ", ")}"
          )
      end

    File.cp!(tarball, @pack)
  end

  defp compile_binary do
    Mix.shell().info("==> compiling single-file binary")
    File.mkdir_p!(Path.dirname(@output))
    # cwd packaging/ so the launcher's relative `./embed/server.tar.gz` import resolves.
    cmd("bun", ["build", "--compile", "launcher.ts", "--outfile", "../#{@output}"],
      cd: "packaging"
    )

    File.chmod!(@output, 0o755)
  end

  defp cmd(exe, args, opts) do
    opts = Keyword.merge([into: IO.stream(:stdio, :line), stderr_to_stdout: true], opts)
    {_output, status} = System.cmd(exe, args, opts)

    if status != 0 do
      Mix.raise("#{exe} #{Enum.join(args, " ")} failed with exit status #{status}")
    end
  end
end

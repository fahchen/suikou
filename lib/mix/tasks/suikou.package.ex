defmodule Mix.Tasks.Suikou.Package do
  @shortdoc "Builds the single-file dist/suikou executable"

  @moduledoc """
  Packages the whole app into one runnable file at `dist/suikou`.

  The build mirrors the sibling `redbug-cli` trick: a self-contained `mix release`
  (ERTS bundled) is tarred and embedded into a `bun --compile` launcher that, at
  runtime, extracts the release, boots the Phoenix server (which serves the API,
  the React SPA, and the Musubi socket same-origin), and opens the browser.

  Steps:

    1. Build the React frontend into `priv/static` (Vite via Bun).
    2. `MIX_ENV=prod mix release suikou` → `_build/prod/rel/suikou`.
    3. Tar the release into `packaging/embed/server.tar.gz`.
    4. `bun build --compile packaging/launcher.ts` → `dist/suikou`.

  Targets the host platform only (macOS arm64).

  ## Examples

      $ mix suikou.package
      #=> packaged -> dist/suikou

  """

  use Mix.Task

  @release_dir "_build/prod/rel"
  @tarball "packaging/embed/server.tar.gz"
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
    tar_release()
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

  defp tar_release do
    Mix.shell().info("==> tarring release")
    File.mkdir_p!(Path.dirname(@tarball))
    cmd("tar", ["-czf", @tarball, "-C", @release_dir, "suikou"])
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

  defp cmd(exe, args, opts \\ []) do
    opts = Keyword.merge([into: IO.stream(:stdio, :line), stderr_to_stdout: true], opts)
    {_output, status} = System.cmd(exe, args, opts)

    if status != 0 do
      Mix.raise("#{exe} #{Enum.join(args, " ")} failed with exit status #{status}")
    end
  end
end

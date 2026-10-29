# The detached server of `SuikouWeb.CLIDaemonTest`: the fake executable runs
# this script in a new OS process, as `start` runs the one-file executable.
# It boots the real Suikou application on the test build as a release boot
# (`RELEASE_NAME` is set), with the test config and the values that
# `config/runtime.exs` gives a packaged boot from the environment that `start`
# passes: the data directory, the port, and the server switch.
data_dir = System.fetch_env!("SUIKOU_DATA_DIR")
port = String.to_integer(System.fetch_env!("PORT"))

config =
  __DIR__
  |> Path.join("../../config/config.exs")
  |> Path.expand()
  |> Config.Reader.read!(env: :test)
  |> Config.Reader.merge(
    suikou: [
      {:cli_data_dir, data_dir},
      {:data_dir, Path.join(data_dir, "scratch")},
      {Suikou.Repo,
       database: Path.join(data_dir, "suikou.db"), pool: DBConnection.ConnectionPool},
      {SuikouWeb.Endpoint,
       server: System.get_env("PHX_SERVER") == "true", http: [ip: {127, 0, 0, 1}, port: port]}
    ]
  )

Application.put_all_env(config, persistent: true)
{:ok, _started} = Application.ensure_all_started(:suikou)

# The server is detached, so an interrupted test run leaves it behind: stop
# it once the OS process of the test node is gone.
owner = System.fetch_env!("SUIKOU_TEST_OWNER")

owner_alive? = fn ->
  Process.sleep(1_000)
  match?({_output, 0}, System.cmd("kill", ["-0", owner], stderr_to_stdout: true))
end

spawn(fn ->
  owner_alive? |> Stream.repeatedly() |> Enum.find(&(not &1))
  System.stop()
end)

# The `stop` route ends this node with `System.stop/0`.
Process.sleep(:infinity)

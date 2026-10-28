defmodule SuikouWeb.CLI.HTTP do
  @moduledoc """
  The CLI's one-purpose HTTP client: POST one JSON document to the loopback
  server and read one JSON response.

  Uses `Req`, which drives the `Plug` stack the release already runs: the CLI
  needs no socket code of its own, and the transport works on a runtime that
  has no `gen_tcp`. `Req.Test` also lets a test call the endpoint's `Plug` with
  no listener at all.

  ## Examples

      SuikouWeb.CLI.HTTP.post(47100, "/api/cli/project/list", "secret", "{}")
      #=> {:ok, 200, "{\\"projects\\":[]}"}

  """

  # A refused connection must not hold up a CLI call: the server is either up
  # on loopback or not there at all.
  @connect_timeout_ms 5_000

  # A liveness probe answers or it does not; a booting server may take a
  # moment to answer its first request, so one second is plenty.
  @probe_timeout_ms 1_000

  @doc """
  Posts `body` to `path` with the Bearer `token` and returns
  `{:ok, status, response_body}`.

  `timeout_ms` bounds the whole exchange; the default clears a `review wait`
  round (the server blocks up to its ~25 s poll window) with slack. A refused
  or lost connection returns `{:error, reason}` — the caller maps that to
  "Suikou is not running".
  """
  @spec post(:inet.port_number(), String.t(), String.t(), String.t(), pos_integer()) ::
          {:ok, pos_integer(), String.t()} | {:error, term()}
  def post(port, path, token, body, timeout_ms \\ 60_000)
      when is_integer(port) and is_binary(path) and is_binary(token) and is_binary(body) do
    request =
      Req.new(
        base_url: "http://127.0.0.1:#{port}",
        headers: [{"authorization", "Bearer #{token}"}],
        retry: false,
        decode_body: false,
        receive_timeout: timeout_ms,
        connect_options: [timeout: @connect_timeout_ms]
      )

    case Req.post(request, url: path, body: body) do
      {:ok, %Req.Response{status: status, body: response}} -> {:ok, status, response}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Whether the server answers on `port` at `127.0.0.1` — a liveness probe.

  One request to the board root: any answer means the server serves, and a
  refused or timed-out connection means it does not. The CLI waits on this
  after a `start`, and the bare boot waits on it before it opens the browser.
  """
  @spec up?(:inet.port_number()) :: boolean()
  def up?(port) when is_integer(port) do
    request =
      Req.new(
        base_url: "http://127.0.0.1:#{port}",
        retry: false,
        decode_body: false,
        receive_timeout: @probe_timeout_ms,
        connect_options: [timeout: @connect_timeout_ms]
      )

    match?({:ok, %Req.Response{}}, Req.get(request, url: "/"))
  end
end

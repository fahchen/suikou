defmodule Suikou.CLI.HTTP do
  @moduledoc """
  The CLI's one-purpose HTTP client: POST one JSON document to the loopback
  server and read one JSON response.

  Stays on `:gen_tcp` with plain HTTP/1.1 and no dependency: Bandit itself
  serves through gen_tcp (Thousand Island's TCP transport), so this is the
  layer PBeam runs as well. One connection per request (`Connection: close`),
  which is all a CLI verb needs.

  ## Examples

      Suikou.CLI.HTTP.post(47100, "/api/cli/project/list", "secret", "{}")
      #=> {:ok, 200, "{\\"projects\\":[]}"}

  """

  @connect_timeout_ms 5_000

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
      [
        "POST #{path} HTTP/1.1\r\n",
        "host: 127.0.0.1:#{port}\r\n",
        "authorization: Bearer #{token}\r\n",
        "content-type: application/json\r\n",
        "accept: application/json\r\n",
        "content-length: #{byte_size(body)}\r\n",
        "connection: close\r\n",
        "\r\n",
        body
      ]

    with {:ok, socket} <-
           :gen_tcp.connect(
             ~c"127.0.0.1",
             port,
             [:binary, packet: :raw, active: false],
             @connect_timeout_ms
           ),
         :ok <- :gen_tcp.send(socket, request),
         {:ok, response} <- recv(socket, timeout_ms) do
      :gen_tcp.close(socket)
      parse(response)
    else
      {:error, reason} -> {:error, reason}
    end
  end

  # Reads until the peer closes (`Connection: close` makes Bandit close after
  # the response) or the timeout elapses.
  defp recv(socket, timeout_ms, acc \\ []) do
    case :gen_tcp.recv(socket, 0, timeout_ms) do
      {:ok, chunk} -> recv(socket, timeout_ms, [chunk | acc])
      {:error, :closed} -> {:ok, acc |> Enum.reverse() |> IO.iodata_to_binary()}
      {:error, reason} -> {:error, reason}
    end
  end

  defp parse(response) do
    [head, body] = :binary.split(response, "\r\n\r\n")
    ["HTTP/1.1 " <> status_line | _headers] = :binary.split(head, "\r\n")
    {status, _rest} = Integer.parse(status_line)

    {:ok, status, body}
  end
end

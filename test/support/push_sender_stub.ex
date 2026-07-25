defmodule Suikou.PushSenderStub do
  @moduledoc """
  Deterministic Web Push sender for tests, wired in via `config/test.exs`. It
  never touches the network: an endpoint containing `"expired"` reports the
  subscription as gone (so `Suikou.Push.notify/1` prunes it), one containing
  `"boom"` raises the way web_push_elixir does on a transport failure, and
  everything else succeeds — enough to exercise the delivery count, the prune
  path, and the fan-out's tolerance of a raising subscriber.
  """

  @doc """
  Mirrors `WebPushElixir.send_notification/2`: decodes the subscription payload
  and returns `{:error, :expired}` for an `"expired"` endpoint, raises for a
  `"boom"` one, otherwise `{:ok, %{}}`.

  ## Examples

      iex> payload = JSON.encode!(%{endpoint: "https://push/expired", keys: %{}})
      iex> Suikou.PushSenderStub.send_notification(payload, "msg")
      {:error, :expired}

      iex> payload = JSON.encode!(%{endpoint: "https://push/live", keys: %{}})
      iex> Suikou.PushSenderStub.send_notification(payload, "msg")
      {:ok, %{}}

  """
  @spec send_notification(String.t(), String.t()) :: {:ok, map()} | {:error, :expired}
  def send_notification(payload, _message) do
    %{"endpoint" => endpoint} = JSON.decode!(payload)

    cond do
      String.contains?(endpoint, "expired") ->
        {:error, :expired}

      # web_push_elixir 0.8.0 has no clause for a transport failure, so a timeout
      # surfaces as a CaseClauseError rather than an error tuple.
      String.contains?(endpoint, "boom") ->
        raise CaseClauseError, term: {:req_request, %{reason: :timeout}}

      # A push service that accepted the connection and then went quiet. Sleeps
      # past :web_push_timeout_ms so the caller abandons it; nothing waits on this
      # process, so there is no state to synchronize with instead.
      String.contains?(endpoint, "stalled") ->
        Process.sleep(:infinity)

      true ->
        {:ok, %{}}
    end
  end
end

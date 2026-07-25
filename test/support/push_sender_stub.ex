defmodule Suikou.PushSenderStub do
  @moduledoc """
  Deterministic Web Push sender for tests, wired in via `config/test.exs`. It
  never touches the network: an endpoint containing `"expired"` reports the
  subscription as gone (so `Suikou.Push.notify/1` prunes it), everything else
  succeeds — enough to exercise both the delivery count and the prune path.
  """

  @doc """
  Mirrors `WebPushElixir.send_notification/2`: decodes the subscription payload
  and returns `{:error, :expired}` for a `"expired"` endpoint, otherwise `{:ok, %{}}`.

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
    if String.contains?(endpoint, "expired"), do: {:error, :expired}, else: {:ok, %{}}
  end
end

defmodule SuikouWeb.PushController do
  @moduledoc """
  Web Push subscription endpoints for the PWA. The frontend fetches the VAPID
  public key to build a subscription, then registers or drops it here. The
  `endpoint`/`p256dh`/`auth` triple arrives flattened (the frontend unwraps the
  browser's nested `PushSubscription.toJSON()` first) and is validated in
  `Suikou.Push`.
  """

  use SuikouWeb, :controller

  alias Suikou.Push

  @doc """
  Returns what the frontend needs before subscribing: the VAPID `public_key`, the
  browser's `applicationServerKey`.

  ## Examples

      get(conn, "/api/push/config")
      #=> 200, %{"public_key" => "BLiX…"}

  """
  @spec config(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def config(conn, _params) do
    json(conn, %{public_key: Application.get_env(:web_push_elixir, :vapid_public_key)})
  end

  @doc """
  Registers (or refreshes) a browser subscription, keyed by its push endpoint.
  Answers `422` with the changeset errors when the payload is incomplete.

  ## Examples

      post(conn, "/api/push/subscribe", %{"endpoint" => "https://push/1", "p256dh" => "BPk", "auth" => "tBH"})
      #=> 200, %{"ok" => true}

  """
  @spec subscribe(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def subscribe(conn, params) do
    case Push.subscribe(params) do
      {:ok, _subscription} ->
        json(conn, %{ok: true})

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: changeset_errors(changeset)})
    end
  end

  @doc """
  Drops the subscription for the `endpoint` in the request body. Idempotent —
  always answers `204`.

  ## Examples

      delete(conn, "/api/push/subscribe", %{"endpoint" => "https://push/1"})
      #=> 204

  """
  @spec unsubscribe(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def unsubscribe(conn, %{"endpoint" => endpoint}) when is_binary(endpoint) do
    Push.unsubscribe(endpoint)
    send_resp(conn, :no_content, "")
  end

  def unsubscribe(conn, _params), do: send_resp(conn, :no_content, "")

  # Standard Ecto changeset → JSON error map (`field => [messages]`), with the
  # `%{count}`-style placeholders interpolated. Kept local so the HTTP layer
  # doesn't reach into the agent-CLI transport module just to format an error.
  defp changeset_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {message, opts} ->
      Enum.reduce(opts, message, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end
end

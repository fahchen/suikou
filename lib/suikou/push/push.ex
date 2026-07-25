defmodule Suikou.Push do
  @moduledoc """
  Web Push notifications for the PWA: the registry of browser subscriptions and
  the fan-out that pushes a review notification to every one of them.

  A subscription is one browser that opted in (see the Settings toggle); the
  agent CLI's `review notify` calls `notify/1` to ask the human to come review.
  Notification content is transient — only subscriptions are stored, never the
  messages. A subscription the push service reports as gone (HTTP 404/410) is
  pruned on the spot, so the registry self-heals as browsers revoke permission.
  """

  import Ecto.Query

  require Logger

  alias Suikou.Repo
  alias Suikou.Schemas.PushSubscription

  # The Web Push sender, seam-injected at compile time so the network side-effect
  # can be stubbed in tests (config/test.exs points it at a deterministic stub).
  # Production compiles the real library call with zero runtime indirection.
  @sender Application.compile_env(:suikou, :web_push_sender, {WebPushElixir, :send_notification})

  @doc """
  Records a browser subscription, keyed by its push `endpoint`. Re-subscribing an
  existing endpoint replaces its keys in place (a browser may rotate them).

  ## Examples

      Suikou.Push.subscribe(%{endpoint: "https://push/1", p256dh: "BPk", auth: "tBH"})
      #=> {:ok, %Suikou.Schemas.PushSubscription{}}

      Suikou.Push.subscribe(%{endpoint: "https://push/1"})
      #=> {:error, %Ecto.Changeset{}}

  """
  @spec subscribe(map()) :: {:ok, PushSubscription.t()} | {:error, Ecto.Changeset.t()}
  def subscribe(params) do
    params
    |> PushSubscription.changeset()
    |> Repo.insert(
      on_conflict: {:replace, [:p256dh, :auth, :updated_at]},
      conflict_target: :endpoint
    )
  end

  @doc """
  Drops the subscription for `endpoint`, if any. Idempotent — a missing endpoint
  is still `:ok`.

  ## Examples

      Suikou.Push.unsubscribe("https://push/1")
      #=> :ok

  """
  @spec unsubscribe(String.t()) :: :ok
  def unsubscribe(endpoint) when is_binary(endpoint) do
    query = from s in PushSubscription, as: :push_subscription, where: s.endpoint == ^endpoint
    Repo.delete_all(query)
    :ok
  end

  @doc """
  Pushes `notification` (`:title`, `:body`, `:url`) to every subscription and
  returns `{:ok, delivered}` — the count the push services accepted. The payload
  is JSON the service worker reads in its `push` handler. Subscriptions the
  service reports as expired are deleted; other transport/HTTP errors are logged
  and skipped so one dead endpoint can't fail the fan-out.

  ## Examples

      Suikou.Push.notify(%{title: "Spec", body: "Ready for review", url: "https://s/reviews/1"})
      #=> {:ok, 1}

  """
  @spec notify(%{title: String.t(), body: String.t(), url: String.t()}) ::
          {:ok, non_neg_integer()}
  def notify(%{title: _title, body: _body, url: _url} = notification) do
    message = JSON.encode!(notification)
    query = from s in PushSubscription, as: :push_subscription
    subscriptions = Repo.all(query)

    delivered =
      Enum.reduce(subscriptions, 0, fn subscription, acc ->
        case deliver(subscription, message) do
          :ok ->
            acc + 1

          :expired ->
            Repo.delete(subscription)
            acc

          :error ->
            acc
        end
      end)

    {:ok, delivered}
  end

  defp deliver(%PushSubscription{} = subscription, message) do
    payload =
      JSON.encode!(%{
        endpoint: subscription.endpoint,
        keys: %{p256dh: subscription.p256dh, auth: subscription.auth}
      })

    {module, function} = @sender

    case apply(module, function, [payload, message]) do
      {:ok, _response} ->
        :ok

      {:error, :expired} ->
        :expired

      {:error, reason} ->
        Logger.warning(
          "web push delivery failed for #{subscription.endpoint}: #{inspect(reason)}"
        )

        :error
    end
  end
end

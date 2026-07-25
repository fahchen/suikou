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

  # How long one subscriber's push may take before it is abandoned. A push service
  # that has gone quiet must not hold a notify open; the subscription is kept and
  # the next notify tries again. Shortened in config/test.exs.
  @send_timeout_ms Application.compile_env(:suikou, :web_push_timeout_ms, 5_000)

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
  service reports as expired are deleted; a subscriber that errors or is
  unreachable is logged and skipped, keeping its row — being unreachable says
  nothing about whether the subscription is still valid.

  Each push is a round-trip to an external service, so they run concurrently: one
  subscriber whose push service is slow would otherwise hold up everyone behind
  it for its whole timeout.

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

    # `deliver/2` never raises, which is what makes this safe: a task that did
    # would take the caller down with it. Repo writes stay in this process — a
    # task doesn't inherit the caller's checked-out connection.
    outcomes =
      subscriptions
      |> Task.async_stream(&{&1, deliver(&1, message)},
        timeout: @send_timeout_ms,
        on_timeout: :kill_task,
        zip_input_on_exit: true,
        ordered: false
      )
      |> Enum.map(&outcome/1)

    prune(for {subscription, :expired} <- outcomes, do: subscription.id)

    {:ok, Enum.count(outcomes, fn {_subscription, outcome} -> outcome == :ok end)}
  end

  # A killed task means the push service never answered in time. That says nothing
  # about the subscription, so it counts as a skip and the row stays.
  defp outcome({:ok, delivered}), do: delivered

  defp outcome({:exit, {%PushSubscription{} = subscription, reason}}) do
    Logger.warning("web push timed out for #{subscription.endpoint}: #{inspect(reason)}")
    {subscription, :error}
  end

  defp prune([]), do: :ok

  defp prune(ids) do
    query = from s in PushSubscription, as: :push_subscription, where: s.id in ^ids
    Repo.delete_all(query)
    :ok
  end

  defp deliver(%PushSubscription{} = subscription, message) do
    payload =
      JSON.encode!(%{
        endpoint: subscription.endpoint,
        keys: %{p256dh: subscription.p256dh, auth: subscription.auth}
      })

    {module, function} = @sender

    # web_push_elixir 0.8.0 only matches HTTP responses, so a transport failure
    # (Apple timing out, DNS, a reset) raises CaseClauseError instead of returning
    # an error tuple. Rescue it here: one unreachable subscriber must not abort the
    # fan-out and lose the pushes queued behind it.
    case safe_send(module, function, payload, message) do
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

  defp safe_send(module, function, payload, message) do
    apply(module, function, [payload, message])
  rescue
    # CaseClauseError: web_push_elixir 0.8.0 matches only HTTP responses, so a
    # transport failure (a timeout, DNS, a reset) falls off the end of its case.
    # ArgumentError: a row whose stored keys no longer decode as base64url.
    # Both are one subscriber's problem, not the batch's.
    error in [CaseClauseError, ArgumentError] -> {:error, Exception.message(error)}
  end
end

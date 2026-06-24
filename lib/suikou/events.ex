defmodule Suikou.Events do
  @moduledoc """
  Domain PubSub for the human review surface.

  Contexts broadcast `{:review_changed, review_id, artifact_id}` after every
  persisted write that affects a review. `artifact_id` scopes the change to one
  file when the write is artifact-local (a comment, reply, resolve, or verdict),
  letting the `SuikouWeb.Stores.ReviewStore` root refresh only that file's
  subtree; it is `nil` for review-level changes (a file opened or removed) where
  the whole body re-derives its file list. A plain broadcast (not
  `broadcast_from`) is deliberate: the writer receives its own event and
  refreshes the same way as remote tabs, so there is a single refresh path.
  """

  @pubsub Suikou.PubSub

  @typedoc "Message delivered to subscribers after a review-affecting write."
  @type message() :: {:review_changed, String.t(), String.t() | nil}

  @doc """
  Subscribes the calling process to `review_id`'s change topic.

  ## Examples

      Suikou.Events.subscribe("01HZ...")
      #=> :ok

  """
  @spec subscribe(String.t()) :: :ok | {:error, term()}
  def subscribe(review_id) when is_binary(review_id) do
    Phoenix.PubSub.subscribe(@pubsub, topic(review_id))
  end

  @doc """
  Broadcasts `{:review_changed, review_id, artifact_id}` to every subscriber of
  the review. `artifact_id` defaults to `nil` (a review-level change).

  A `nil` `review_id` (an unresolvable write) is a no-op, so callers can pass a
  best-effort lookup result without guarding it themselves.

  ## Examples

      Suikou.Events.review_changed("01HZ...", "01HA...")
      #=> :ok

      Suikou.Events.review_changed("01HZ...")
      #=> :ok

      Suikou.Events.review_changed(nil)
      #=> :ok

  """
  @spec review_changed(String.t() | nil, String.t() | nil) :: :ok | {:error, term()}
  def review_changed(review_id, artifact_id \\ nil)

  def review_changed(nil, _artifact_id), do: :ok

  def review_changed(review_id, artifact_id) when is_binary(review_id) do
    Phoenix.PubSub.broadcast(
      @pubsub,
      topic(review_id),
      {:review_changed, review_id, artifact_id}
    )
  end

  defp topic(review_id), do: "review:" <> review_id
end

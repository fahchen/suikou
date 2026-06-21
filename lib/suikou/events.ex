defmodule Suikou.Events do
  @moduledoc """
  Domain PubSub for the human review surface.

  Contexts broadcast `{:review_changed, review_id}` after every persisted write
  that affects a review (a comment, reply, verdict, or file-list change). The
  `SuikouWeb.Stores.ReviewStore` root subscribes at mount and reloads its body
  child on each message, so the writer's own tab and every other tab open on the
  same review converge through one path. A plain broadcast (not `broadcast_from`)
  is deliberate: the writer receives its own event and refreshes the same way as
  remote tabs, so there is a single refresh mechanism and no separate local path.
  """

  @pubsub Suikou.PubSub

  @typedoc "Message delivered to subscribers after a review-affecting write."
  @type message() :: {:review_changed, String.t()}

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
  Broadcasts `{:review_changed, review_id}` to every subscriber of the review.

  A `nil` `review_id` (an unresolvable write) is a no-op, so callers can pass a
  best-effort lookup result without guarding it themselves.

  ## Examples

      Suikou.Events.review_changed("01HZ...")
      #=> :ok

      Suikou.Events.review_changed(nil)
      #=> :ok

  """
  @spec review_changed(String.t() | nil) :: :ok | {:error, term()}
  def review_changed(nil), do: :ok

  def review_changed(review_id) when is_binary(review_id) do
    Phoenix.PubSub.broadcast(@pubsub, topic(review_id), {:review_changed, review_id})
  end

  defp topic(review_id), do: "review:" <> review_id
end

defmodule SuikouWeb.Stores.CommentBroadcast do
  @moduledoc """
  PubSub bridge that lets the `SuikouWeb.Stores.ReviewStore` root refresh its
  all-files `files_comments` fan-out when a comment mutation lands on the
  `SuikouWeb.Stores.CommentsStore` child.

  A child command (resolve/edit/reply/…) only re-derives the child's own
  `:items` assign, so the runtime never re-renders the root — its parent-owned
  `files_comments` (computed fresh in `render/1`) would stay stale until a full
  reload. The child broadcasts `:comments_changed` on the review-scoped topic
  after every mutation, the root subscribes at mount, and its `handle_info/2`
  dirties an assign to force the next render to recompute the fan-out. Tabs
  open on sibling artifacts of the same review refresh for free.
  """

  @pubsub Suikou.PubSub

  @typedoc "Message delivered to subscribers after a comment mutation."
  @type message() :: :comments_changed

  @doc """
  Subscribes the calling process to `review_id`'s comment-change topic.

  ## Examples

      SuikouWeb.Stores.CommentBroadcast.subscribe("01HZ...")
      #=> :ok
  """
  @spec subscribe(String.t()) :: :ok | {:error, term()}
  def subscribe(review_id) when is_binary(review_id) do
    Phoenix.PubSub.subscribe(@pubsub, topic(review_id))
  end

  @doc """
  Broadcasts `:comments_changed` to every subscriber of `review_id`'s topic.

  ## Examples

      SuikouWeb.Stores.CommentBroadcast.broadcast("01HZ...")
      #=> :ok
  """
  @spec broadcast(String.t()) :: :ok | {:error, term()}
  def broadcast(review_id) when is_binary(review_id) do
    Phoenix.PubSub.broadcast(@pubsub, topic(review_id), :comments_changed)
  end

  defp topic(review_id), do: "review_comments:" <> review_id
end

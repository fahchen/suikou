defmodule SuikouWeb.Stores.CommentBroadcast do
  @moduledoc """
  PubSub bridge that lets the `SuikouWeb.Stores.ReviewStore` root react when a
  comment or verdict mutation lands on one of its `SuikouWeb.Stores.FileStore`
  children (or their `SuikouWeb.Stores.CommentsStore` grandchild).

  A child command only re-derives its own assigns, so the runtime never
  re-renders the root on its own. The child broadcasts `:comments_changed` on the
  review-scoped topic after every mutation; the root subscribes at mount and its
  `handle_info/2` refreshes the file list and bumps the reload token, so the file
  rows and every child thread pick up the change. Tabs open on the same review
  refresh for free.
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

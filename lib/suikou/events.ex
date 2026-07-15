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

  alias Suikou.Events.FsChange

  @pubsub Suikou.PubSub

  @typedoc "Message delivered to subscribers of a review's change topic."
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

  @doc """
  Subscribes the calling process to `review_id`'s filesystem-change topic.

  Separate from `subscribe/1`: only the file-forwarding path subscribes here, so
  a disk event never wakes a review's other subscribers.

  ## Examples

      Suikou.Events.subscribe_fs("01HZ...")
      #=> :ok

  """
  @spec subscribe_fs(String.t()) :: :ok | {:error, term()}
  def subscribe_fs(review_id) when is_binary(review_id) do
    Phoenix.PubSub.subscribe(@pubsub, fs_topic(review_id))
  end

  @doc """
  Broadcasts a `Suikou.Events.FsChange` on the review's filesystem-change topic,
  signalling that the review-relative `rel_path` changed on disk. `exists?` is
  false when the change was a deletion, so the client can drop the file rather
  than mark it stale.

  ## Examples

      Suikou.Events.fs_changed("01HZ...", "lib/a.ex", true)
      #=> :ok

  """
  @spec fs_changed(String.t(), String.t(), boolean()) :: :ok | {:error, term()}
  def fs_changed(review_id, rel_path, exists?)
      when is_binary(review_id) and is_binary(rel_path) and is_boolean(exists?) do
    Phoenix.PubSub.broadcast(
      @pubsub,
      fs_topic(review_id),
      %FsChange{review_id: review_id, rel_path: rel_path, exists?: exists?}
    )
  end

  defp topic(review_id), do: "review:" <> review_id
  defp fs_topic(review_id), do: "review:" <> review_id <> ":fs"
end

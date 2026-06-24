defmodule SuikouWeb.Stores.BoardBroadcast do
  @moduledoc """
  PubSub bridge that lets the `SuikouWeb.Stores.ProjectBoardStore` root refresh
  its review list when the board changes from outside the connection.

  The board renders entirely from the database, so a write on another
  connection (e.g. a CLI `review create`/`rename`/`delete`) never dirties an
  open board and pushes no patch. The
  writer broadcasts `:board_changed` on the single board-wide topic, the board
  subscribes at mount, and its `handle_info/2` recomputes the review list and
  dirties an assign so the next render reflects the change live.
  """

  @pubsub Suikou.PubSub
  @topic "project_board"

  @typedoc "Message delivered to subscribers after a board mutation."
  @type message() :: :board_changed

  @doc """
  Subscribes the calling process to the board-change topic.

  ## Examples

      SuikouWeb.Stores.BoardBroadcast.subscribe()
      #=> :ok
  """
  @spec subscribe() :: :ok | {:error, term()}
  def subscribe do
    Phoenix.PubSub.subscribe(@pubsub, @topic)
  end

  @doc """
  Broadcasts `:board_changed` to every subscriber of the board topic.

  ## Examples

      SuikouWeb.Stores.BoardBroadcast.broadcast()
      #=> :ok
  """
  @spec broadcast() :: :ok | {:error, term()}
  def broadcast do
    Phoenix.PubSub.broadcast(@pubsub, @topic, :board_changed)
  end
end

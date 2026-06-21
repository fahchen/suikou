defmodule SuikouWeb.Stores.CommentsStore do
  @moduledoc """
  Child store owning the comment thread for the viewed round.

  The parent `SuikouWeb.Stores.FileStore` mounts it with the viewed `round_id`
  and the artifact's `artifact_id`. It resolves anchors and pre-renders the
  round's comments into the `:items` assign synchronously on `init/1`, on every
  parent `update/2`, and after every mutating command, so `render/1` reads
  assigns only and never touches the database. Commands write through
  `Suikou.Critique`; new comments target the artifact's latest round, which is
  the unsubmitted draft.
  """

  use Musubi.Store

  alias Musubi.Socket
  alias Suikou.Critique
  alias Suikou.Reads
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Round
  alias SuikouWeb.Stores.CommentBroadcast
  alias SuikouWeb.Stores.CommentContract
  alias SuikouWeb.Stores.CommentRendering
  require CommentContract

  state do
    CommentContract.comments_items_field()
  end

  command :add_comment do
    payload do
      field(:scope, :review | :artifact | :located)
      field(:critique_type, :fix_required | :needs_answer | :note)
      field(:body, String.t())

      CommentContract.optional_anchor_field()
    end
  end

  command :edit_comment do
    payload do
      field(:comment_id, String.t())
      field(:body, String.t())
      field(:critique_type, :fix_required | :needs_answer | :note)
    end
  end

  command :delete_comment do
    payload do
      field(:comment_id, String.t())
    end
  end

  command :resolve_comment do
    payload do
      field(:comment_id, String.t())
    end
  end

  command :reply do
    payload do
      field(:comment_id, String.t())
      field(:body, String.t())
    end
  end

  command :edit_reply do
    payload do
      field(:reply_id, String.t())
      field(:body, String.t())
    end
  end

  command :delete_reply do
    payload do
      field(:reply_id, String.t())
    end
  end

  command :relocate_comment do
    payload do
      field(:comment_id, String.t())

      CommentContract.required_anchor_field()
    end
  end

  @impl Musubi.Store
  @spec init(Socket.t()) :: {:ok, Socket.t()}
  def init(socket), do: {:ok, reload(socket)}

  @impl Musubi.Store
  @spec update(map(), Socket.t()) :: {:ok, Socket.t()}
  def update(assigns, socket), do: {:ok, socket |> Socket.assign(assigns) |> reload()}

  @impl Musubi.Store
  @spec render(Socket.t()) :: map()
  def render(socket) do
    %{items: socket.assigns[:items] || []}
  end

  @impl Musubi.Store
  @spec handle_command(atom(), map(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_command(:add_comment, payload, socket) do
    # Authoring routes through FileStore.add_comment (which mints on demand);
    # this path only fires for an already-minted artifact. Read defensively so
    # an unminted file no-ops instead of crashing the store.
    case socket.assigns[:artifact_id] && Rounds.latest(socket.assigns[:artifact_id]) do
      %{id: round_id} ->
        Critique.add_comment(%{
          round_id: round_id,
          scope: payload["scope"],
          critique_type: payload["critique_type"],
          body: payload["body"],
          anchor: payload["anchor"]
        })

      nil ->
        :noop
    end

    {:noreply, socket |> reload() |> broadcast_changed()}
  end

  def handle_command(:edit_comment, payload, socket) do
    Critique.edit_comment(payload["comment_id"], %{
      body: payload["body"],
      critique_type: payload["critique_type"]
    })

    {:noreply, socket |> reload() |> broadcast_changed()}
  end

  def handle_command(:delete_comment, payload, socket) do
    Critique.delete_comment(payload["comment_id"])
    {:noreply, socket |> reload() |> broadcast_changed()}
  end

  def handle_command(:resolve_comment, payload, socket) do
    Critique.resolve_comment(payload["comment_id"])
    {:noreply, socket |> reload() |> broadcast_changed()}
  end

  def handle_command(:reply, payload, socket) do
    Critique.reply_as_human(payload["comment_id"], payload["body"])
    {:noreply, socket |> reload() |> broadcast_changed()}
  end

  def handle_command(:edit_reply, payload, socket) do
    Critique.edit_reply(payload["reply_id"], payload["body"])
    {:noreply, socket |> reload() |> broadcast_changed()}
  end

  def handle_command(:delete_reply, payload, socket) do
    Critique.delete_reply(payload["reply_id"])
    {:noreply, socket |> reload() |> broadcast_changed()}
  end

  def handle_command(:relocate_comment, payload, socket) do
    Critique.relocate_comment(payload["comment_id"], payload["anchor"])
    {:noreply, socket |> reload() |> broadcast_changed()}
  end

  # Resolve anchors and pre-render the comment list into the `:items` assign so
  # `render/1` stays zero-DB. The distinct rendered list is the dirty signal the
  # render cycle diffs after a mutation.
  defp reload(socket) do
    Socket.assign(socket, :items, render_items(socket.assigns[:artifact_id], socket.assigns[:round_id]))
  end

  defp render_items(artifact_id, round_id) do
    case round_id && Rounds.get(round_id) do
      %Round{} = round ->
        content = CommentRendering.live_content(artifact_id)
        round |> Reads.list_comments() |> Enum.map(&CommentRendering.render_comment(&1, content))

      _no_round ->
        []
    end
  end

  # Notify the parent `ReviewStore` (and any sibling-artifact tabs of the same
  # review) so its all-files `files_comments` fan-out refreshes — the child
  # reload above only re-derives this round's thread.
  defp broadcast_changed(socket) do
    with artifact_id when is_binary(artifact_id) <- socket.assigns[:artifact_id],
         %Artifact{review_id: review_id} <- Reads.get_artifact(artifact_id) do
      CommentBroadcast.broadcast(review_id)
    end

    socket
  end
end

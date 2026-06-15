defmodule SuikouWeb.Stores.CommentsStore do
  @moduledoc """
  Child store owning the comment thread for the viewed round.

  The parent `SuikouWeb.Stores.ReviewStore` mounts it with the viewed
  `round_id` and the artifact's `artifact_id`. It loads the round's comments
  into an assign and re-derives that assign after every mutating command, so the
  render cycle always has an explicit dirty signal — no external-only mutation
  that the runtime cannot see (see `docs/musubi-issues.md` ISSUE-1). Commands
  write through `Suikou.Critique`; new comments target the artifact's latest
  round, which is the unsubmitted draft.
  """

  use Musubi.Store

  alias Musubi.Socket
  alias Suikou.Critique
  alias Suikou.Reads
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias SuikouWeb.Stores.CommentBroadcast
  alias SuikouWeb.Stores.CommentRendering

  # The comment shape literal is the contract the client narrows against and
  # is repeated in `ReviewStore.files_comments`; both must move together, and
  # extracting it would force a generated-d.ts indirection without making the
  # contract any clearer.
  # credo:disable-for-this-file Credo.Check.Design.DuplicatedCode

  state do
    field(
      :items,
      list(%{
        id: String.t(),
        scope: :review | :artifact | :located,
        critique_type: :fix_required | :needs_answer | :note,
        status: :pending | :published,
        body: String.t(),
        resolved: boolean(),
        resolved_round: integer() | nil,
        outdated: boolean(),
        original_round: integer() | nil,
        carried: boolean(),
        inserted_at: String.t(),
        anchor:
          %{
            type: :line_range,
            start_line: integer(),
            end_line: integer(),
            quote: String.t()
          }
          | %{
              type: :diff_hunk,
              side: :old | :new,
              start_line: integer(),
              end_line: integer(),
              quote: String.t()
            }
          | %{
              type: :element,
              selector: String.t(),
              quote: String.t()
            }
          | nil,
        replies:
          list(%{
            id: String.t(),
            author: :human | :agent,
            body: String.t(),
            inserted_at: String.t()
          })
      })
    )
  end

  command :add_comment do
    payload do
      field(:scope, :review | :artifact | :located)
      field(:critique_type, :fix_required | :needs_answer | :note)
      field(:body, String.t())

      field(
        :anchor,
        %{type: :line_range, start_line: integer(), end_line: integer()}
        | %{type: :diff_hunk, side: :old | :new, start_line: integer(), end_line: integer()}
        | %{type: :element, selector: String.t(), quote: String.t()}
        | nil
      )
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

  command :unresolve_comment do
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

  command :relocate_comment do
    payload do
      field(:comment_id, String.t())

      field(
        :anchor,
        %{type: :line_range, start_line: integer(), end_line: integer()}
        | %{type: :diff_hunk, side: :old | :new, start_line: integer(), end_line: integer()}
        | %{type: :element, selector: String.t(), quote: String.t()}
      )
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
    content = CommentRendering.live_content(socket.assigns[:artifact_id])
    %{items: Enum.map(socket.assigns.comments, &CommentRendering.render_comment(&1, content))}
  end

  @impl Musubi.Store
  @spec handle_command(atom(), map(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_command(:add_comment, payload, socket) do
    case Rounds.latest(socket.assigns.artifact_id) do
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

  def handle_command(:unresolve_comment, payload, socket) do
    Critique.unresolve_comment(payload["comment_id"])
    {:noreply, socket |> reload() |> broadcast_changed()}
  end

  def handle_command(:reply, payload, socket) do
    Critique.reply_as_human(payload["comment_id"], payload["body"])
    {:noreply, socket |> reload() |> broadcast_changed()}
  end

  def handle_command(:relocate_comment, payload, socket) do
    Critique.relocate_comment(payload["comment_id"], payload["anchor"])
    {:noreply, socket |> reload() |> broadcast_changed()}
  end

  # Re-derive the comment list into an assign so the render cycle sees a content
  # diff after a DB mutation. Distinct struct values are the dirty signal.
  defp reload(socket) do
    comments =
      case socket.assigns[:round_id] do
        nil -> []
        round_id -> Reads.list_comments(round_id)
      end

    Socket.assign(socket, :comments, comments)
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

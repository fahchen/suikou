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
  alias Suikou.Artifacts
  alias Suikou.Critique
  alias Suikou.Reads
  alias Suikou.Rounds
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply
  alias SuikouWeb.Iso8601

  state do
    field(
      :items,
      list(%{
        id: String.t(),
        scope: :line | :file | :review,
        critique_type: :fix_required | :needs_answer | :note,
        status: :pending | :published,
        body: String.t(),
        resolved: boolean(),
        resolved_round: integer() | nil,
        outdated: boolean(),
        original_round: integer() | nil,
        carried: boolean(),
        inserted_at: String.t(),
        anchor: %{start_line: integer(), end_line: integer(), quote: String.t()} | nil,
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
      field(:scope, :line | :file | :review)
      field(:critique_type, :fix_required | :needs_answer | :note)
      field(:body, String.t())
      field(:start_line, integer() | nil)
      field(:end_line, integer() | nil)
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
      field(:start_line, integer())
      field(:end_line, integer())
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
    lines = live_lines(socket.assigns[:artifact_id])
    %{items: Enum.map(socket.assigns.comments, &render_comment(&1, lines))}
  end

  defp live_lines(artifact_id) do
    case Artifacts.read_content_or_nil(artifact_id) do
      nil -> nil
      content -> String.split(content, "\n")
    end
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
          start_line: payload["start_line"],
          end_line: payload["end_line"]
        })

      nil ->
        :noop
    end

    {:noreply, reload(socket)}
  end

  def handle_command(:edit_comment, payload, socket) do
    Critique.edit_comment(payload["comment_id"], %{
      body: payload["body"],
      critique_type: payload["critique_type"]
    })

    {:noreply, reload(socket)}
  end

  def handle_command(:delete_comment, payload, socket) do
    Critique.delete_comment(payload["comment_id"])
    {:noreply, reload(socket)}
  end

  def handle_command(:resolve_comment, payload, socket) do
    Critique.resolve_comment(payload["comment_id"])
    {:noreply, reload(socket)}
  end

  def handle_command(:unresolve_comment, payload, socket) do
    Critique.unresolve_comment(payload["comment_id"])
    {:noreply, reload(socket)}
  end

  def handle_command(:reply, payload, socket) do
    Critique.reply_as_human(payload["comment_id"], payload["body"])
    {:noreply, reload(socket)}
  end

  def handle_command(:relocate_comment, payload, socket) do
    Critique.relocate_comment(payload["comment_id"], payload["start_line"], payload["end_line"])
    {:noreply, reload(socket)}
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

  defp render_comment(%Comment{} = comment, lines) do
    {anchor, outdated} = Critique.resolve_anchor(comment.anchor, lines)

    %{
      id: comment.id,
      scope: comment.scope,
      critique_type: comment.critique_type,
      status: comment.status,
      body: comment.body,
      resolved: not is_nil(comment.resolved_round),
      resolved_round: comment.resolved_round,
      outdated: outdated,
      original_round: comment.original_round,
      carried: not is_nil(comment.origin_id),
      inserted_at: Iso8601.utc(comment.inserted_at),
      anchor: anchor,
      replies: Enum.map(comment.replies, &render_reply/1)
    }
  end

  defp render_reply(%Reply{} = reply) do
    %{
      id: reply.id,
      author: reply.author,
      body: reply.body,
      inserted_at: Iso8601.utc(reply.inserted_at)
    }
  end
end

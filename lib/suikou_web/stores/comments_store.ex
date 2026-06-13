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
  alias Suikou.Schemas.Anchor.DiffHunk
  alias Suikou.Schemas.Anchor.Element
  alias Suikou.Schemas.Anchor.LineRange
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply
  alias SuikouWeb.Iso8601

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
    content = live_content(socket.assigns[:artifact_id])
    %{items: Enum.map(socket.assigns.comments, &render_comment(&1, content))}
  end

  # File-selection artifacts resolve line_range anchors against the file split
  # on newlines; git-diff artifacts resolve diff_hunk anchors against the live
  # unified diff text. The render pre-computes whichever shape this artifact
  # needs so every comment is resolved against the same value.
  defp live_content(nil), do: nil

  defp live_content(artifact_id) do
    case Artifacts.content_source(artifact_id) do
      {:ok, {:file, path}} ->
        case File.read(path) do
          {:ok, bytes} -> String.split(bytes, "\n")
          {:error, _posix} -> nil
        end

      {:ok, {:inline, diff, "text/x-diff"}} ->
        diff

      {:error, _reason} ->
        nil
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
          anchor: payload["anchor"]
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
    Critique.relocate_comment(payload["comment_id"], payload["anchor"])
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

  defp render_comment(%Comment{} = comment, content) do
    {anchor, outdated} = Critique.resolve_anchor(comment.anchor, content)

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
      anchor: tagged_anchor(comment.anchor, anchor),
      replies: Enum.map(comment.replies, &render_reply/1)
    }
  end

  # Wrap the resolved anchor view with the kind discriminator that drives the
  # client tagged-union narrowing. Today only `:line_range` exists; future kinds
  # add a clause without reshaping the read contract.
  defp tagged_anchor(nil, _resolved), do: nil

  defp tagged_anchor(%LineRange{}, resolved) when is_map(resolved) do
    Map.put(resolved, :type, :line_range)
  end

  defp tagged_anchor(%DiffHunk{}, resolved) when is_map(resolved) do
    Map.put(resolved, :type, :diff_hunk)
  end

  defp tagged_anchor(%Element{}, resolved) when is_map(resolved) do
    Map.put(resolved, :type, :element)
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

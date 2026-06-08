defmodule SuikouWeb.Stores.DiffStore do
  @moduledoc """
  Child store rendering the diff between two submitted rounds.

  The parent `SuikouWeb.Stores.ReviewStore` mounts it only while a round pair is
  selected, passing `artifact_id`, `from`, and `to` as assigns; closing the diff
  unmounts it. It reads the comparison from `Suikou.Reads.round_diff/3` and is
  read-only — the parent owns the open/close state, so the child needs no
  commands. Historical rounds are immutable, so the diff re-renders only when the
  selected pair changes.
  """

  use Musubi.Store

  alias Musubi.Socket
  alias Suikou.Reads
  alias Suikou.Schemas.Comment

  state do
    field(:from, integer())
    field(:to, integer())
    field(:text, list(%{op: :eq | :ins | :del, value: String.t()}))

    field(
      :resolved,
      list(%{
        id: String.t(),
        critique_type: :fix_required | :needs_answer | :note,
        body: String.t()
      })
    )

    field(
      :added,
      list(%{
        id: String.t(),
        critique_type: :fix_required | :needs_answer | :note,
        body: String.t()
      })
    )

    field(
      :carried_forward,
      list(%{
        id: String.t(),
        critique_type: :fix_required | :needs_answer | :note,
        body: String.t()
      })
    )

    field(:verdict_from, :approve | :request_changes | :comment | nil)
    field(:verdict_to, :approve | :request_changes | :comment | nil)
  end

  @impl Musubi.Store
  @spec init(Socket.t()) :: {:ok, Socket.t()}
  def init(socket), do: {:ok, socket}

  @impl Musubi.Store
  @spec render(Socket.t()) :: map()
  def render(socket) do
    %{artifact_id: artifact_id, from: from, to: to} = socket.assigns

    case Reads.round_diff(artifact_id, from, to) do
      {:ok, diff} ->
        %{
          from: from,
          to: to,
          text: Enum.map(diff.text, &render_segment/1),
          resolved: Enum.map(diff.resolved, &render_comment/1),
          added: Enum.map(diff.added, &render_comment/1),
          carried_forward: Enum.map(diff.carried_forward, &render_comment/1),
          verdict_from: diff.verdict_from,
          verdict_to: diff.verdict_to
        }

      {:error, _reason} ->
        %{
          from: from,
          to: to,
          text: [],
          resolved: [],
          added: [],
          carried_forward: [],
          verdict_from: nil,
          verdict_to: nil
        }
    end
  end

  # Read-only diff declares no commands; this satisfies the Musubi.Store
  # behaviour and is never reached, since the router only dispatches declared commands.
  @impl Musubi.Store
  @spec handle_command(atom(), map(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_command(_name, _payload, socket), do: {:noreply, socket}

  defp render_segment({op, value}), do: %{op: op, value: value}

  defp render_comment(%Comment{} = comment) do
    %{id: comment.id, critique_type: comment.critique_type, body: comment.body}
  end
end

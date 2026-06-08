defmodule SuikouWeb.Stores.ReviewStore do
  @moduledoc """
  Root store backing the human review surface for a single artifact.

  Mounts against an `artifact_id` (and optional `round_number`, defaulting to the
  latest) and renders the full reviewer view: the artifact list for the sidebar,
  the artifact's rounds, the viewed round's snapshot, its comments with anchors
  and thread replies, and the latest recorded verdict. Commands write through the
  `Suikou.Critique` and `Suikou.Review` domains; every command re-renders from
  `Suikou.Reads`, so the snapshot always reflects committed state.
  """

  use Musubi.Store, root: true

  alias Musubi.Socket
  alias Suikou.Critique
  alias Suikou.Reads
  alias Suikou.Review
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply
  alias Suikou.Schemas.Round

  state do
    field(:artifact, %{
      id: String.t(),
      title: String.t(),
      approved: boolean(),
      approved_round: integer() | nil
    })

    field(
      :artifacts,
      list(%{
        id: String.t(),
        title: String.t(),
        approved: boolean(),
        latest_round: integer() | nil
      })
    )

    field(
      :rounds,
      list(%{
        number: integer(),
        content_hash: String.t(),
        verdict: :approve | :request_changes | :comment | nil,
        comment_count: integer()
      })
    )

    field(:current_round, %{
      number: integer(),
      content: String.t(),
      is_latest: boolean()
    })

    field(
      :comments,
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
        anchor: %{start_line: integer(), end_line: integer(), quote: String.t()} | nil,
        replies: list(%{id: String.t(), author: :human | :agent, body: String.t()})
      })
    )

    field(:latest_verdict, :approve | :request_changes | :comment | nil)

    field(
      :diff,
      %{
        from: integer(),
        to: integer(),
        text: list(%{op: :eq | :ins | :del, value: String.t()}),
        resolved:
          list(%{
            id: String.t(),
            critique_type: :fix_required | :needs_answer | :note,
            body: String.t()
          }),
        added:
          list(%{
            id: String.t(),
            critique_type: :fix_required | :needs_answer | :note,
            body: String.t()
          }),
        carried_forward:
          list(%{
            id: String.t(),
            critique_type: :fix_required | :needs_answer | :note,
            body: String.t()
          }),
        verdict_from: :approve | :request_changes | :comment | nil,
        verdict_to: :approve | :request_changes | :comment | nil
      }
      | nil
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

  command :reply do
    payload do
      field(:comment_id, String.t())
      field(:body, String.t())
    end
  end

  command :submit_review do
    payload do
      field(:verdict, :approve | :request_changes | :comment)
    end

    reply do
      field(:warnings, list(String.t()))
    end
  end

  command :select_round do
    payload do
      field(:number, integer())
    end
  end

  command :relocate_comment do
    payload do
      field(:comment_id, String.t())
      field(:start_line, integer())
      field(:end_line, integer())
    end
  end

  command :diff_round do
    payload do
      field(:from, integer())
      field(:to, integer())
    end
  end

  command :close_diff do
  end

  command :dismiss do
  end

  @impl Musubi.Store
  @spec mount(map(), Socket.t()) :: {:ok, Socket.t()}
  def mount(params, socket) do
    artifact_id = Map.fetch!(params, "artifact_id")

    {:ok,
     socket
     |> Socket.assign(:artifact_id, artifact_id)
     |> Socket.assign(:round_number, params["round_number"])}
  end

  @impl Musubi.Store
  @spec render(Socket.t()) :: map()
  def render(socket) do
    artifact_id = socket.assigns.artifact_id
    artifact = Reads.get_artifact(artifact_id)
    rounds = Reads.list_rounds(artifact_id)
    viewed = viewed_round(rounds, Map.get(socket.assigns, :round_number))
    latest_number = latest_round_number(rounds)

    %{
      artifact: render_artifact(artifact),
      artifacts: Enum.map(Reads.list_artifacts(), &render_artifact_summary/1),
      rounds: Enum.map(rounds, &render_round_summary/1),
      current_round: render_current_round(viewed, latest_number),
      comments: render_comments(viewed),
      latest_verdict: viewed && Review.latest_verdict(viewed.id),
      diff: render_diff(artifact_id, Map.get(socket.assigns, :diff_range))
    }
  end

  @impl Musubi.Store
  @spec handle_command(atom(), map(), Socket.t()) ::
          {:noreply, Socket.t()} | {:reply, map(), Socket.t()}
  def handle_command(:add_comment, payload, socket) do
    case Rounds.latest(socket.assigns.artifact_id) do
      %Round{} = round ->
        params = %{
          round_id: round.id,
          scope: payload["scope"],
          critique_type: payload["critique_type"],
          body: payload["body"],
          start_line: payload["start_line"],
          end_line: payload["end_line"]
        }

        Critique.add_comment(params)

      nil ->
        :noop
    end

    {:noreply, touch(socket)}
  end

  def handle_command(:edit_comment, payload, socket) do
    Critique.edit_comment(payload["comment_id"], %{
      body: payload["body"],
      critique_type: payload["critique_type"]
    })

    {:noreply, touch(socket)}
  end

  def handle_command(:delete_comment, payload, socket) do
    Critique.delete_comment(payload["comment_id"])
    {:noreply, touch(socket)}
  end

  def handle_command(:resolve_comment, payload, socket) do
    Critique.resolve_comment(payload["comment_id"])
    {:noreply, touch(socket)}
  end

  def handle_command(:reply, payload, socket) do
    Critique.reply_as_human(payload["comment_id"], payload["body"])
    {:noreply, touch(socket)}
  end

  def handle_command(:submit_review, payload, socket) do
    warnings =
      case latest_round(socket.assigns.artifact_id) do
        %Round{} = round ->
          case Review.submit_review(round.id, payload["verdict"]) do
            {:ok, %{warnings: warnings}} -> Enum.map(warnings, &Atom.to_string/1)
            {:error, _reason} -> []
          end

        nil ->
          []
      end

    {:reply, %{warnings: warnings}, touch(socket)}
  end

  def handle_command(:select_round, payload, socket) do
    {:noreply, Socket.assign(socket, :round_number, payload["number"])}
  end

  def handle_command(:relocate_comment, payload, socket) do
    Critique.relocate_comment(payload["comment_id"], payload["start_line"], payload["end_line"])
    {:noreply, touch(socket)}
  end

  def handle_command(:diff_round, payload, socket) do
    {:noreply, Socket.assign(socket, :diff_range, {payload["from"], payload["to"]})}
  end

  def handle_command(:close_diff, _payload, socket) do
    {:noreply, Socket.assign(socket, :diff_range, nil)}
  end

  def handle_command(:dismiss, _payload, socket) do
    Review.dismiss(socket.assigns.artifact_id)
    {:noreply, touch(socket)}
  end

  # The root store's render derives entirely from `Suikou.Reads`; commands that
  # only mutate the database leave assigns untouched, so the resolver reuses the
  # cached render and pushes no patch (see docs/musubi-issues.md ISSUE-1). Bump a
  # render-irrelevant assign to mark the socket changed and force a re-render.
  defp touch(socket), do: Socket.assign(socket, :rev, System.unique_integer())

  defp latest_round(artifact_id), do: Rounds.latest(artifact_id)

  defp viewed_round([], _number), do: nil

  defp viewed_round(rounds, nil), do: List.last(rounds)

  defp viewed_round(rounds, number) do
    Enum.find(rounds, List.last(rounds), &(&1.number == number))
  end

  defp latest_round_number([]), do: nil
  defp latest_round_number(rounds), do: List.last(rounds).number

  defp render_artifact(%Artifact{} = artifact) do
    %{
      id: artifact.id,
      title: artifact.title,
      approved: not is_nil(artifact.approved_round),
      approved_round: artifact.approved_round
    }
  end

  defp render_artifact_summary(%Artifact{} = artifact) do
    %{
      id: artifact.id,
      title: artifact.title,
      approved: not is_nil(artifact.approved_round),
      latest_round: Rounds.latest_number(artifact.id)
    }
  end

  defp render_round_summary(%Round{} = round) do
    %{
      number: round.number,
      content_hash: round.content_hash,
      verdict: Review.latest_verdict(round.id),
      comment_count: length(Reads.list_comments(round.id))
    }
  end

  defp render_current_round(nil, _latest_number) do
    %{number: 0, content: "", is_latest: true}
  end

  defp render_current_round(%Round{} = round, latest_number) do
    %{number: round.number, content: round.content, is_latest: round.number == latest_number}
  end

  defp render_comments(nil), do: []

  defp render_comments(%Round{} = round) do
    round.id |> Reads.list_comments() |> Enum.map(&render_comment/1)
  end

  defp render_comment(%Comment{} = comment) do
    %{
      id: comment.id,
      scope: comment.scope,
      critique_type: comment.critique_type,
      status: comment.status,
      body: comment.body,
      resolved: not is_nil(comment.resolved_round),
      resolved_round: comment.resolved_round,
      outdated: comment.outdated,
      original_round: comment.original_round,
      carried: not is_nil(comment.origin_id),
      anchor: render_anchor(comment.anchor),
      replies: Enum.map(comment.replies, &render_reply/1)
    }
  end

  defp render_anchor(nil), do: nil

  defp render_anchor(anchor) do
    %{start_line: anchor.start_line, end_line: anchor.end_line, quote: anchor.quote}
  end

  defp render_reply(%Reply{} = reply) do
    %{id: reply.id, author: reply.author, body: reply.body}
  end

  defp render_diff(_artifact_id, nil), do: nil

  defp render_diff(artifact_id, {from, to}) do
    case Reads.round_diff(artifact_id, from, to) do
      {:ok, diff} ->
        %{
          from: from,
          to: to,
          text: Enum.map(diff.text, &render_diff_segment/1),
          resolved: Enum.map(diff.resolved, &render_diff_comment/1),
          added: Enum.map(diff.added, &render_diff_comment/1),
          carried_forward: Enum.map(diff.carried_forward, &render_diff_comment/1),
          verdict_from: diff.verdict_from,
          verdict_to: diff.verdict_to
        }

      {:error, _reason} ->
        nil
    end
  end

  defp render_diff_segment({op, value}), do: %{op: op, value: value}

  defp render_diff_comment(%Comment{} = comment) do
    %{id: comment.id, critique_type: comment.critique_type, body: comment.body}
  end
end

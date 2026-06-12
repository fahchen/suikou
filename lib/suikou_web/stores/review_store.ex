defmodule SuikouWeb.Stores.ReviewStore do
  @moduledoc """
  Root store backing the human review surface for a single artifact.

  Mounts against an `artifact_id` (and optional `round_number`, defaulting to the
  latest) and renders the artifact header, its rounds, the viewed round, and the
  latest recorded verdict. Reviewed content is served separately over HTTP, not
  carried in the snapshot. The viewed round's comment thread is delegated to a
  `SuikouWeb.Stores.CommentsStore` child. The root owns round selection, so every
  root command changes an assign and the render cycle always has a dirty signal.
  """

  use Musubi.Store, root: true

  alias Musubi.Child
  alias Musubi.Socket
  alias Suikou.Reads
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Round
  alias Suikou.Submissions
  alias SuikouWeb.Stores.CommentsStore

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
      content_hash: String.t(),
      is_latest: boolean()
    })

    field(:comments, CommentsStore.state())

    field(:latest_verdict, :approve | :request_changes | :comment | nil)

    field(:draft_verdict, :approve | :request_changes | :comment | nil)
  end

  command :submit_review do
    payload do
      field(:verdict, :approve | :request_changes | :comment)
    end

    reply do
      field(:warnings, list(String.t()))
    end
  end

  command :set_draft_verdict do
    payload do
      field(:verdict, :approve | :request_changes | :comment)
    end
  end

  command :select_round do
    payload do
      field(:number, integer())
    end
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
      artifacts:
        Enum.map(Reads.list_review_artifacts(artifact.review_id), &render_artifact_summary/1),
      rounds: Enum.map(rounds, &render_round_summary/1),
      current_round: render_current_round(viewed, latest_number),
      comments: comments_child(artifact_id, viewed),
      latest_verdict: viewed && Submissions.latest_verdict(viewed.id),
      draft_verdict: draft_verdict(rounds)
    }
  end

  @impl Musubi.Store
  @spec handle_command(atom(), map(), Socket.t()) ::
          {:noreply, Socket.t()} | {:reply, map(), Socket.t()}
  def handle_command(:submit_review, payload, socket) do
    case latest_round(socket.assigns.artifact_id) do
      %Round{} = round ->
        case Submissions.submit(round.id, payload["verdict"]) do
          {:ok, %{warnings: warnings, next_round: %Round{number: next_number}}} ->
            {:reply, %{warnings: Enum.map(warnings, &Atom.to_string/1)},
             Socket.assign(socket, :round_number, next_number)}

          {:error, _reason} ->
            {:reply, %{warnings: []}, socket}
        end

      nil ->
        {:reply, %{warnings: []}, socket}
    end
  end

  def handle_command(:set_draft_verdict, payload, socket) do
    case latest_round(socket.assigns.artifact_id) do
      %Round{} = round ->
        Submissions.set_draft_verdict(round.id, payload["verdict"])
        {:noreply, socket}

      nil ->
        {:noreply, socket}
    end
  end

  def handle_command(:select_round, payload, socket) do
    {:noreply, Socket.assign(socket, :round_number, payload["number"])}
  end

  defp comments_child(artifact_id, nil) do
    Child.child(CommentsStore, id: "comments", artifact_id: artifact_id, round_id: nil)
  end

  defp comments_child(artifact_id, %Round{} = viewed) do
    Child.child(CommentsStore, id: "comments", artifact_id: artifact_id, round_id: viewed.id)
  end

  defp latest_round(artifact_id), do: Rounds.latest(artifact_id)

  defp draft_verdict([]), do: nil
  defp draft_verdict(rounds), do: List.last(rounds).draft_verdict

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
      verdict: Submissions.latest_verdict(round.id),
      comment_count: length(Reads.list_comments(round.id))
    }
  end

  defp render_current_round(nil, _latest_number) do
    %{number: 0, content_hash: "", is_latest: true}
  end

  defp render_current_round(%Round{} = round, latest_number) do
    %{
      number: round.number,
      content_hash: round.content_hash,
      is_latest: round.number == latest_number
    }
  end
end

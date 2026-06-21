defmodule SuikouWeb.Stores.FileStore do
  @moduledoc """
  Child store backing one review file.

  Owns the file-scoped round selector, verdict state, and comment thread. Files
  that have not been opened yet render an empty thread until their first comment
  or verdict write mints the artifact.
  """

  use Musubi.Store

  alias Musubi.Child
  alias Musubi.Socket
  alias Suikou.Critique
  alias Suikou.Reads
  alias Suikou.Reviews
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.Round
  alias Suikou.Submissions
  alias SuikouWeb.Stores.CommentBroadcast
  alias SuikouWeb.Stores.CommentContract
  alias SuikouWeb.Stores.CommentsStore
  require CommentContract

  state do
    field(:path, String.t())
    field(:artifact_id, String.t() | nil)
    field(:content_hash, String.t() | nil)

    field(
      :change_status,
      :added | :modified | :deleted | :renamed | :copied | :type_changed | nil
    )

    field(:artifact, %{
      id: String.t(),
      title: String.t(),
      approved: boolean(),
      approved_round: integer() | nil
    })

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

  command :set_draft_verdict do
    payload do
      field(:verdict, :approve | :request_changes | :comment)
    end
  end

  command :add_comment do
    payload do
      field(:scope, :review | :artifact | :located)
      field(:critique_type, :fix_required | :needs_answer | :note)
      field(:body, String.t())

      CommentContract.optional_anchor_field()
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
    %{
      path: socket.assigns.path,
      artifact_id: socket.assigns[:artifact_id],
      content_hash: socket.assigns[:content_hash],
      change_status: socket.assigns[:change_status],
      artifact: socket.assigns[:artifact],
      rounds: socket.assigns[:rounds] || [],
      current_round: socket.assigns[:current_round] || current_round(0, "", true),
      comments: comments_child(socket),
      latest_verdict: socket.assigns[:latest_verdict],
      draft_verdict: socket.assigns[:draft_verdict]
    }
  end

  @impl Musubi.Store
  @spec handle_command(atom(), map(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_command(:set_draft_verdict, payload, socket) do
    socket =
      case ensure_artifact(socket) do
        {:ok, artifact_id, socket} ->
          case Rounds.latest(artifact_id) do
            %Round{id: round_id} ->
              _result = Submissions.set_draft_verdict(round_id, payload["verdict"])
              CommentBroadcast.broadcast(socket.assigns.review_id)
              socket

            nil ->
              socket
          end

        {:error, socket} ->
          socket
      end

    {:noreply, socket |> bump_comments_reload_token() |> reload()}
  end

  def handle_command(:add_comment, payload, socket) do
    socket =
      case ensure_artifact(socket) do
        {:ok, artifact_id, socket} ->
          case Rounds.latest(artifact_id) do
            %Round{id: round_id} ->
              _result =
                Critique.add_comment(%{
                  round_id: round_id,
                  scope: payload["scope"],
                  critique_type: payload["critique_type"],
                  body: payload["body"],
                  anchor: payload["anchor"]
                })

              CommentBroadcast.broadcast(socket.assigns.review_id)
              socket

            nil ->
              socket
          end

        {:error, socket} ->
          socket
      end

    {:noreply, socket |> bump_comments_reload_token() |> reload()}
  end

  defp comments_child(socket) do
    Child.child(CommentsStore,
      id: "comments",
      artifact_id: socket.assigns[:artifact_id],
      round_id: socket.assigns[:current_round_id],
      reload_token: {socket.assigns[:reload_token], socket.assigns[:comments_reload_token]}
    )
  end

  defp ensure_artifact(%Socket{} = socket) do
    case socket.assigns[:artifact_id] do
      artifact_id when is_binary(artifact_id) -> {:ok, artifact_id, socket}
      nil -> mint_artifact(socket)
    end
  end

  defp mint_artifact(%Socket{} = socket) do
    with %Review{} = review <- Reviews.get_review(socket.assigns.review_id),
         {:ok, %Artifact{} = artifact} <- Reviews.open_file(review, socket.assigns.path) do
      {:ok, artifact.id, Socket.assign(socket, :artifact_id, artifact.id)}
    else
      nil -> {:error, socket}
      {:error, _reason} -> {:error, socket}
    end
  end

  defp reload(socket) do
    case socket.assigns[:artifact_id] && Reads.get_artifact(socket.assigns[:artifact_id]) do
      %Artifact{} = artifact ->
        rounds = Reads.list_rounds(artifact.id)
        viewed = viewed_round(rounds, socket.assigns[:round_number])
        latest = List.last(rounds)

        socket
        |> Socket.assign(:artifact, render_artifact(artifact))
        |> Socket.assign(:rounds, Enum.map(rounds, &render_round_summary/1))
        |> Socket.assign(:current_round, render_current_round(viewed, latest))
        |> Socket.assign(:current_round_id, viewed && viewed.id)
        |> Socket.assign(:latest_verdict, Submissions.latest_verdict_for_artifact(artifact.id))
        |> Socket.assign(:draft_verdict, latest && latest.draft_verdict)

      _missing ->
        socket
        |> Socket.assign(
          :artifact,
          missing_artifact(socket.assigns.path, socket.assigns[:artifact_id])
        )
        |> Socket.assign(:rounds, [])
        |> Socket.assign(:current_round, current_round(0, "", true))
        |> Socket.assign(:current_round_id, nil)
        |> Socket.assign(:latest_verdict, nil)
        |> Socket.assign(:draft_verdict, nil)
    end
  end

  defp viewed_round([], _number), do: nil
  defp viewed_round(rounds, nil), do: List.last(rounds)

  defp viewed_round(rounds, number),
    do: Enum.find(rounds, List.last(rounds), &(&1.number == number))

  defp render_artifact(%Artifact{} = artifact) do
    %{
      id: artifact.id,
      title: artifact.title,
      approved: not is_nil(artifact.approved_round),
      approved_round: artifact.approved_round
    }
  end

  defp missing_artifact(path, artifact_id) do
    %{
      id: artifact_id || "",
      title: path,
      approved: false,
      approved_round: nil
    }
  end

  defp render_round_summary(%Round{} = round) do
    %{
      number: round.number,
      content_hash: round.content_hash,
      verdict: Submissions.latest_verdict(round.id),
      comment_count: Reads.count_comments(round)
    }
  end

  defp render_current_round(nil, _latest_round) do
    current_round(0, "", true)
  end

  defp render_current_round(%Round{} = viewed, %Round{} = latest_round) do
    current_round(viewed.number, viewed.content_hash, viewed.number == latest_round.number)
  end

  defp current_round(number, content_hash, is_latest) do
    %{number: number, content_hash: content_hash, is_latest: is_latest}
  end

  defp bump_comments_reload_token(socket) do
    Socket.assign(socket, :comments_reload_token, System.unique_integer())
  end
end

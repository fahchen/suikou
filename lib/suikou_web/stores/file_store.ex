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
  alias SuikouWeb.Stores.CommentContract
  alias SuikouWeb.Stores.CommentsStore
  require CommentContract

  # The live snapshot carries only what must stream in real time: the comment
  # thread, the file's verdicts, and the viewed round number. The file's static
  # identity (path title, artifact, content hashes, change status) is served by
  # `SuikouWeb.Stores.ReviewStore`'s `load_review_structure` command and joined to
  # this row by `path` on the client. `path` stays here as that join key.
  state do
    field(:path, String.t())

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
  def update(assigns, socket) do
    {:ok, socket |> Socket.assign(assigns) |> reload()}
  end

  @impl Musubi.Store
  @spec render(Socket.t()) :: map()
  def render(socket) do
    %{
      path: socket.assigns.path,
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
              socket

            nil ->
              socket
          end

        {:error, socket} ->
          socket
      end

    {:noreply, socket}
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

              socket

            nil ->
              socket
          end

        {:error, socket} ->
          socket
      end

    {:noreply, socket}
  end

  defp comments_child(socket) do
    Child.child(CommentsStore,
      id: "comments",
      artifact_id: socket.assigns[:artifact_id],
      round_id: socket.assigns[:current_round_id]
    )
  end

  defp ensure_artifact(%Socket{} = socket) do
    # Bracket access, not `.artifact_id`: an unminted file is mounted with
    # `artifact_id: nil`, and a nil-valued prop is dropped from assigns, so the
    # key is absent (not nil) — dot access would raise KeyError and crash the
    # page server.
    case socket.assigns[:artifact_id] do
      artifact_id when is_binary(artifact_id) -> {:ok, artifact_id, socket}
      nil -> mint_artifact(socket)
    end
  end

  defp mint_artifact(%Socket{} = socket) do
    with review_id when is_binary(review_id) <- socket.assigns[:review_id],
         path when is_binary(path) <- socket.assigns[:path],
         %Review{} = review <- Reviews.get_review(review_id),
         {:ok, %Artifact{} = artifact} <- Reviews.open_file(review, path) do
      {:ok, artifact.id, Socket.assign(socket, :artifact_id, artifact.id)}
    else
      _unmintable -> {:error, socket}
    end
  end

  defp reload(socket) do
    case socket.assigns[:artifact_id] && Reads.get_artifact(socket.assigns[:artifact_id]) do
      %Artifact{} = artifact ->
        rounds = Reads.list_rounds(artifact.id)
        viewed = viewed_round(rounds, socket.assigns[:round_number])
        latest = List.last(rounds)

        socket
        |> Socket.assign(:current_round, render_current_round(viewed, latest))
        |> Socket.assign(:current_round_id, viewed && viewed.id)
        |> Socket.assign(:latest_verdict, Submissions.latest_verdict_for_artifact(artifact.id))
        |> Socket.assign(:draft_verdict, latest && latest.draft_verdict)

      _missing ->
        socket
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

  defp render_current_round(nil, _latest_round) do
    current_round(0, "", true)
  end

  defp render_current_round(%Round{} = viewed, %Round{} = latest_round) do
    current_round(viewed.number, viewed.content_hash, viewed.number == latest_round.number)
  end

  defp current_round(number, content_hash, is_latest) do
    %{number: number, content_hash: content_hash, is_latest: is_latest}
  end
end

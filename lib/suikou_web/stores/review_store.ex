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

  alias Musubi.AsyncResult
  alias Musubi.Child
  alias Musubi.Socket
  alias Suikou.Critique
  alias Suikou.Reads
  alias Suikou.Reviews
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.ReviewSource.FileSelection
  alias Suikou.Schemas.ReviewSource.GitDiff
  alias Suikou.Schemas.Round
  alias Suikou.Submissions
  alias SuikouWeb.Stores.CommentBroadcast
  alias SuikouWeb.Stores.CommentContract
  alias SuikouWeb.Stores.CommentRendering
  alias SuikouWeb.Stores.CommentsStore
  require CommentContract

  state do
    # The parent review's id, exposed so the client can fetch unminted file
    # contents over `/api/review/:review_id/files/content?path=<path>` from any
    # surface mounted under this store. Empty string if the artifact (and thus
    # the parent review) was deleted out from under an open tab.
    field(:review_id, String.t())

    field(:artifact, %{
      id: String.t(),
      title: String.t(),
      kind: :file | :diff,
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

    # Authoritative full file list for the parent review, expanded via
    # `Reviews.list_files/1`. Carries every covered path — including ones
    # whose artifact has not been minted yet (`artifact_id: nil`). The
    # `content_hash` is a stable per-version cache key the frontend uses
    # when fetching `/api/review/:review_id/files/content?path=<path>`.
    field(
      :files,
      Musubi.AsyncResult.of(
        list(%{
          path: String.t(),
          artifact_id: String.t() | nil,
          approved: boolean(),
          verdict: :approve | :request_changes | :comment | nil,
          content_hash: String.t() | nil,
          change_status: :added | :modified | :deleted | :renamed | :copied | :type_changed | nil
        })
      )
    )

    # Per-file comment threads for the all-files display mode. Only minted
    # files appear — an unminted entry has no round to attach comments to, so
    # its frame renders empty until the first add mints it. Anchors are
    # resolved against each artifact's live content, matching the per-artifact
    # `comments` child contract one-for-one.
    CommentContract.files_comments_field()
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

  command :open_file do
    payload do
      field(:path, String.t())
    end

    reply do
      field(:artifact_id, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  command :set_file_draft_verdict do
    payload do
      field(:path, String.t())
      field(:verdict, :approve | :request_changes | :comment)
    end

    reply do
      field(:artifact_id, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  command :add_file_comment do
    payload do
      field(:path, String.t())
      field(:scope, :review | :artifact | :located)
      field(:critique_type, :fix_required | :needs_answer | :note)
      field(:body, String.t())

      CommentContract.optional_anchor_field()
    end

    reply do
      field(:artifact_id, String.t() | nil)
      field(:error, String.t() | nil)
    end
  end

  @impl Musubi.Store
  @spec mount(map(), Socket.t()) :: {:ok, Socket.t()}
  def mount(params, socket) do
    artifact_id = Map.fetch!(params, "artifact_id")
    subscribe_comment_changes(artifact_id)

    socket =
      socket
      |> Socket.assign(:artifact_id, artifact_id)
      |> Socket.assign(:round_number, params["round_number"])
      |> refresh_files()

    {:ok, socket}
  end

  # A comment mutation on the `CommentsStore` child does not dirty this root,
  # so its parent-owned `files_comments` fan-out (recomputed in `render/1`)
  # would stay stale. Bump an internal assign as the dirty signal — the next
  # render rebuilds the fan-out so the all-files rail reflects the change live.
  @impl Musubi.Store
  @spec handle_info(CommentBroadcast.message(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_info(:comments_changed, socket) do
    {:noreply, Socket.assign(socket, :comment_rev, System.unique_integer())}
  end

  @impl Musubi.Store
  @spec render(Socket.t()) :: map()
  def render(socket) do
    artifact_id = socket.assigns.artifact_id

    snapshot =
      case Reads.get_artifact(artifact_id) do
        nil -> missing_snapshot(artifact_id)
        %Artifact{} = artifact -> present_snapshot(artifact, artifact_id, socket)
      end

    snapshot
    |> Map.put(:files, Map.get(socket.assigns, :files, AsyncResult.loading()))
    |> Map.put(:files_comments, files_comments_snapshot(snapshot.review_id))
  end

  defp present_snapshot(%Artifact{} = artifact, artifact_id, socket) do
    rounds = Reads.list_rounds(artifact_id)
    viewed = viewed_round(rounds, Map.get(socket.assigns, :round_number))
    latest_number = latest_round_number(rounds)

    %{
      review_id: artifact.review_id,
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

  # An artifact deleted out from under an open tab (its review was removed)
  # renders an empty snapshot — the frontend turns the blank id into a
  # not-found notice — rather than crashing the store on a nil artifact.
  defp missing_snapshot(artifact_id) do
    %{
      review_id: "",
      artifact: %{id: "", title: "", kind: :file, approved: false, approved_round: nil},
      artifacts: [],
      rounds: [],
      current_round: current_round(0, "", true),
      comments: comments_child(artifact_id, nil),
      latest_verdict: nil,
      draft_verdict: nil
    }
  end

  # All-files comment fan-out: walk every active artifact in this review,
  # resolving each one's latest-round thread against its own live content.
  # Unminted files are intentionally absent — they have no round yet, so the
  # frame renders empty until the first comment mints them through
  # `add_file_comment`. `live_content/1` only fires for artifacts that have at
  # least one comment, so empty reviews never touch the filesystem.
  defp files_comments_snapshot(""), do: []

  defp files_comments_snapshot(review_id) do
    review_id
    |> Reads.list_review_artifacts()
    |> Enum.flat_map(&render_file_thread/1)
  end

  defp render_file_thread(%Artifact{} = artifact) do
    case Rounds.latest(artifact.id) do
      %Round{} = round ->
        items = Reads.list_comments(round.id)

        content =
          if items == [], do: nil, else: CommentRendering.live_content(artifact.id)

        [
          %{
            artifact_id: artifact.id,
            path: artifact.file_path,
            items: Enum.map(items, &CommentRendering.render_comment(&1, content))
          }
        ]

      nil ->
        []
    end
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

  # Mint-on-click for the review's file list. Resolves the parent review from
  # the mounted artifact, opens `path` (minting its artifact lazily when the
  # file has not been visited yet), and refreshes the `:files` async so the
  # row's `artifact_id` flips from `nil` to the minted id.
  def handle_command(:open_file, payload, socket) do
    case parent_review(socket.assigns.artifact_id) do
      %Review{} = review ->
        case Reviews.open_file(review, payload["path"]) do
          {:ok, artifact} ->
            {:reply, %{artifact_id: artifact.id, error: nil}, refresh_files(socket)}

          {:error, reason} ->
            {:reply, %{artifact_id: nil, error: open_error(reason)}, socket}
        end

      nil ->
        {:reply, %{artifact_id: nil, error: "review_not_found"}, socket}
    end
  end

  # Path-aware draft-verdict write for all-files mode: lands a draft verdict
  # on ANY file in the review (minting if the file has not been opened yet),
  # so the inactive card's chip commits in place instead of being routed
  # through a cross-shell navigation.
  def handle_command(:set_file_draft_verdict, payload, socket) do
    case parent_review(socket.assigns.artifact_id) do
      %Review{} = review ->
        with {:ok, artifact} <- Reviews.open_file(review, payload["path"]),
             %Round{id: round_id} <- Rounds.latest(artifact.id),
             {:ok, _round} <- Submissions.set_draft_verdict(round_id, payload["verdict"]) do
          {:reply, %{artifact_id: artifact.id, error: nil}, refresh_files(socket)}
        else
          nil ->
            {:reply, %{artifact_id: nil, error: "no_round"}, socket}

          {:error, reason} ->
            {:reply, %{artifact_id: nil, error: open_error(reason)}, socket}
        end

      nil ->
        {:reply, %{artifact_id: nil, error: "review_not_found"}, socket}
    end
  end

  # All-files commenting: target ANY file in the review by `path`, minting on
  # demand so the very first comment on an unvisited file also lands. The
  # mutation goes through `Critique.add_comment` so the resulting comment is
  # indistinguishable from one authored in single-file mode through the
  # `CommentsStore` child.
  def handle_command(:add_file_comment, payload, socket) do
    case parent_review(socket.assigns.artifact_id) do
      %Review{} = review ->
        with {:ok, artifact} <- Reviews.open_file(review, payload["path"]),
             %Round{id: round_id} <- Rounds.latest(artifact.id),
             {:ok, _comment} <-
               Critique.add_comment(%{
                 round_id: round_id,
                 scope: payload["scope"],
                 critique_type: payload["critique_type"],
                 body: payload["body"],
                 anchor: payload["anchor"]
               }) do
          {:reply, %{artifact_id: artifact.id, error: nil}, refresh_files(socket)}
        else
          nil ->
            {:reply, %{artifact_id: nil, error: "no_round"}, socket}

          {:error, reason} ->
            {:reply, %{artifact_id: nil, error: open_error(reason)}, socket}
        end

      nil ->
        {:reply, %{artifact_id: nil, error: "review_not_found"}, socket}
    end
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
      kind: artifact_kind(artifact),
      approved: not is_nil(artifact.approved_round),
      approved_round: artifact.approved_round
    }
  end

  # A diff review's artifacts hold a unified diff in their content stream; the
  # client routes by `kind` rather than by `file_path`'s extension so opening
  # `lib/foo.ex` under a diff review still picks the diff renderer.
  defp artifact_kind(%Artifact{review: %Review{source: %GitDiff{}}}), do: :diff
  defp artifact_kind(%Artifact{review: %Review{source: %FileSelection{}}}), do: :file
  defp artifact_kind(_other), do: :file

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
      comment_count: Reads.count_comments(round.id)
    }
  end

  defp render_current_round(nil, _latest_number) do
    current_round(0, "", true)
  end

  defp render_current_round(%Round{} = round, latest_number) do
    current_round(round.number, round.content_hash, round.number == latest_number)
  end

  defp current_round(number, content_hash, is_latest) do
    %{number: number, content_hash: content_hash, is_latest: is_latest}
  end

  # Stale-while-revalidate: omit `reset:` so a refresh keeps the prior file
  # list visible (status flips to loading, result is retained) instead of
  # blanking `:files` to nil. A nil would tear down the all-files stack — losing
  # scroll position after a verdict-note commit and flashing the loading
  # skeleton after an inline comment. The first mount has no prior, so it still
  # loads from empty.
  defp refresh_files(socket) do
    artifact_id = socket.assigns.artifact_id

    assign_async(socket, :files, fn -> {:ok, fetch_files(artifact_id)} end)
  end

  defp fetch_files(artifact_id) do
    case parent_review(artifact_id) do
      %Review{} = review -> Reviews.list_files(review)
      nil -> []
    end
  end

  defp parent_review(artifact_id) do
    case Reads.get_artifact(artifact_id) do
      %Artifact{review_id: review_id} -> Reviews.get_review(review_id)
      nil -> nil
    end
  end

  defp subscribe_comment_changes(artifact_id) do
    case Reads.get_artifact(artifact_id) do
      %Artifact{review_id: review_id} -> CommentBroadcast.subscribe(review_id)
      nil -> :ok
    end
  end

  defp open_error(reason) when is_atom(reason), do: Atom.to_string(reason)

  defp open_error(%Ecto.Changeset{errors: errors}) do
    Enum.map_join(errors, ", ", fn {field, {message, _opts}} -> "#{field} #{message}" end)
  end
end

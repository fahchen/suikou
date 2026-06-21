defmodule SuikouWeb.Stores.ReviewStore do
  @moduledoc """
  Thin root store backing the human review surface for a single review.

  It owns only the `review_id` and the review-wide commands (`submit_review`,
  `remove_file`), and mounts a single `SuikouWeb.Stores.ReviewBodyStore` child
  that owns the review chrome, file list, and aggregates. It subscribes to the
  review's `Suikou.Events` change topic at mount and forwards every change to the
  body child via `Musubi.send_update/2`, so a mutation on any page refreshes the
  tree. The domain contexts emit the event after each persisted write, so the
  writer's own page refreshes through the same path as every other open tab.
  """

  use Musubi.Store, root: true

  alias Musubi.Child
  alias Musubi.Socket
  alias Suikou.Events
  alias Suikou.Reads
  alias Suikou.Reviews
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.Round
  alias Suikou.Submissions
  alias SuikouWeb.Stores.ReviewBodyStore

  state do
    field(:review_id, String.t())
    field(:body, ReviewBodyStore.state())
  end

  command :submit_review do
    reply do
      field(:warnings, list(String.t()))
    end
  end

  command :select_round do
    payload do
      field(:number, integer())
    end
  end

  command :remove_file do
    payload do
      field(:path, String.t())
    end
  end

  @impl Musubi.Store
  @spec mount(map(), Socket.t()) :: {:ok, Socket.t()}
  def mount(params, socket) do
    review_id = Map.fetch!(params, "review_id")
    Events.subscribe(review_id)
    {:ok, Socket.assign(socket, :review_id, review_id)}
  end

  @impl Musubi.Store
  @spec handle_info(Events.message(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_info({:review_changed, _review_id}, socket) do
    Musubi.send_update(Socket.store_id(socket) ++ ["body"], %{})
    {:noreply, socket}
  end

  @impl Musubi.Store
  @spec render(Socket.t()) :: map()
  def render(socket) do
    %{
      review_id: socket.assigns.review_id,
      body:
        Child.child(ReviewBodyStore,
          id: "body",
          review_id: socket.assigns.review_id,
          round_number: socket.assigns[:round_number]
        )
    }
  end

  @impl Musubi.Store
  @spec handle_command(:submit_review, map(), Socket.t()) :: {:reply, map(), Socket.t()}
  def handle_command(:submit_review, _payload, socket) do
    warnings =
      socket.assigns.review_id
      |> Reads.list_review_artifacts()
      |> Enum.reduce([], &submit_artifact/2)

    {:reply, %{warnings: warnings}, socket}
  end

  @spec handle_command(:select_round, map(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_command(:select_round, payload, socket) do
    {:noreply, Socket.assign(socket, :round_number, payload["number"])}
  end

  @spec handle_command(:remove_file, map(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_command(:remove_file, payload, socket) do
    case Reviews.get_review(socket.assigns.review_id) do
      %Review{} = review ->
        _result = Reviews.remove_file(review, payload["path"])
        {:noreply, socket}

      nil ->
        {:noreply, socket}
    end
  end

  defp submit_artifact(%Artifact{} = artifact, warnings) do
    case {verdict_to_submit(artifact), Rounds.latest(artifact.id)} do
      {nil, _round} ->
        warnings

      {_verdict, nil} ->
        warnings

      {verdict, %Round{} = round} ->
        case Submissions.submit(round.id, verdict) do
          {:ok, %{warnings: round_warnings}} ->
            warnings ++ Enum.map(round_warnings, &Atom.to_string/1)

          {:error, _reason} ->
            warnings
        end
    end
  end

  # A file's submit verdict: its draft chip, or an implicit `comment` when it has
  # only pending comments — so submitting a review with feedback but no verdicts
  # still publishes that critique. Untouched files stay nil and are skipped.
  defp verdict_to_submit(%Artifact{} = artifact) do
    case Submissions.draft_verdict_for_artifact(artifact.id) do
      nil -> if Submissions.comments_pending?(artifact.id), do: :comment
      verdict -> verdict
    end
  end
end

defmodule SuikouWeb.Stores.ArtifactsInboxStore do
  @moduledoc """
  Root store listing every artifact for the reviewer's inbox.

  Takes no mount params, so a client can mount it before it knows which
  artifact to open — it replaces the REST bootstrap the review SPA used to
  discover a starting `artifact_id`. Each entry carries the artifact's title,
  approval state, and latest round number; selection of a specific artifact
  stays with `SuikouWeb.Stores.ReviewStore`. Read-only: no commands.
  """

  use Musubi.Store, root: true

  alias Musubi.Socket
  alias Suikou.Reads
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact

  state do
    field(
      :artifacts,
      list(%{
        id: String.t(),
        title: String.t(),
        approved: boolean(),
        latest_round: integer() | nil
      })
    )
  end

  @impl Musubi.Store
  @spec mount(map(), Socket.t()) :: {:ok, Socket.t()}
  def mount(_params, socket), do: {:ok, socket}

  @impl Musubi.Store
  @spec render(Socket.t()) :: map()
  def render(_socket) do
    %{artifacts: Enum.map(Reads.list_artifacts(), &render_summary/1)}
  end

  # Read-only inbox declares no commands; this satisfies the Musubi.Store
  # behaviour and is never reached, since the router only dispatches declared commands.
  @impl Musubi.Store
  @spec handle_command(atom(), map(), Socket.t()) :: {:noreply, Socket.t()}
  def handle_command(_name, _payload, socket), do: {:noreply, socket}

  defp render_summary(%Artifact{} = artifact) do
    %{
      id: artifact.id,
      title: artifact.title,
      approved: not is_nil(artifact.approved_round),
      latest_round: Rounds.latest_number(artifact.id)
    }
  end
end

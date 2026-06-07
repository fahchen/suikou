defmodule SuikouWeb.ArtifactController do
  @moduledoc """
  Bootstrap endpoint for the single-page review surface. The Musubi
  `SuikouWeb.Stores.ReviewStore` mounts against an `artifact_id`, but the SPA
  has no id until it loads one — this index hands it the artifact list so it can
  pick a starting artifact, then mount the store over the channel.
  """

  use SuikouWeb, :controller

  alias Suikou.Reads
  alias Suikou.Schemas.Artifact

  @doc """
  Lists every artifact as `{id, title, approved_round}`, newest first.

  ## Examples

      conn |> SuikouWeb.ArtifactController.index(%{})
      #=> %{artifacts: [%{id: "...", title: "...", approved_round: nil}]}

  """
  @spec index(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def index(conn, _params) do
    artifacts = Enum.map(Reads.list_artifacts(), &summary/1)
    json(conn, %{artifacts: artifacts})
  end

  defp summary(%Artifact{} = artifact) do
    %{id: artifact.id, title: artifact.title, approved_round: artifact.approved_round}
  end
end

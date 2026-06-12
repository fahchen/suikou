defmodule SuikouWeb.AssetController do
  @moduledoc """
  Serves files referenced by an artifact's markdown (images and the like),
  reading them from the artifact's project directory. The reference is resolved
  and bounds-checked by `Suikou.Artifacts.resolve_asset/2`; anything that can't
  be resolved to a regular file inside the project answers 404.
  """

  use SuikouWeb, :controller

  alias Suikou.Artifacts

  @doc """
  Sends the file an artifact's markdown references at `path`, or 404 when it
  can't be resolved to a regular file inside the artifact's project.

  ## Examples

      get(conn, "/api/review/0192.../asset/img/diagram.png")
      #=> 200, image/png

  """
  @spec show(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def show(conn, %{"artifact_id" => artifact_id, "path" => segments}) do
    case Artifacts.resolve_asset(artifact_id, Path.join(segments)) do
      {:ok, absolute} ->
        conn
        |> put_resp_content_type(MIME.from_path(absolute), nil)
        |> send_file(200, absolute)

      {:error, _reason} ->
        send_resp(conn, 404, "")
    end
  end
end

defmodule SuikouWeb.AssetController do
  @moduledoc """
  Serves an artifact's own source file and the files its markdown references
  (images and the like), reading them live from the artifact's project
  directory. References are resolved and bounds-checked by `Suikou.Artifacts`;
  anything that can't be resolved to a regular file inside the project answers
  404.
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
      {:ok, absolute} -> serve(conn, absolute)
      {:error, _reason} -> send_resp(conn, 404, "")
    end
  end

  @doc """
  Sends an artifact's own reviewed source file live from disk, or 404 when it
  can't be resolved to a regular file inside its project. The media type is the
  file's own, so the frontend renders text and displays images from one route.

  ## Examples

      get(conn, "/api/review/0192.../content")
      #=> 200, text/markdown

  """
  @spec content(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def content(conn, %{"artifact_id" => artifact_id}) do
    case Artifacts.content_path(artifact_id) do
      {:ok, absolute} -> serve(conn, absolute)
      {:error, _reason} -> send_resp(conn, 404, "")
    end
  end

  defp serve(conn, absolute) do
    conn
    |> put_resp_content_type(MIME.from_path(absolute), nil)
    |> send_file(200, absolute)
  end
end

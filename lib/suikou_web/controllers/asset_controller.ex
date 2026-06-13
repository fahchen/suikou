defmodule SuikouWeb.AssetController do
  @moduledoc """
  Serves an artifact's own reviewed content and the files its markdown
  references (images and the like), reading them live from the artifact's
  project directory. References are resolved and bounds-checked by
  `Suikou.Artifacts`; anything that can't be resolved answers 404. A
  file-selection artifact streams its source file with its own media type; a
  git-diff artifact streams the live unified diff inline as `text/x-diff`.
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
      {:ok, absolute} -> serve_file(conn, absolute)
      {:error, _reason} -> send_resp(conn, 404, "")
    end
  end

  @doc """
  Sends an artifact's reviewed content live: a file-selection artifact answers
  the file's bytes with its own media type; a git-diff artifact answers the
  live unified diff inline as `text/x-diff`. 404 when the source can't be
  resolved or read.

  ## Examples

      get(conn, "/api/review/0192.../content")
      #=> 200, text/markdown

      get(conn, "/api/review/0193.../content")
      #=> 200, text/x-diff

  """
  @spec content(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def content(conn, %{"artifact_id" => artifact_id}) do
    case Artifacts.content_source(artifact_id) do
      {:ok, {:file, absolute}} -> serve_file(conn, absolute)
      {:ok, {:inline, bytes, content_type}} -> serve_inline(conn, bytes, content_type)
      {:error, _reason} -> send_resp(conn, 404, "")
    end
  end

  defp serve_file(conn, absolute) do
    conn
    |> put_resp_content_type(MIME.from_path(absolute), nil)
    |> send_file(200, absolute)
  end

  defp serve_inline(conn, bytes, content_type) do
    conn
    |> put_resp_content_type(content_type, nil)
    |> send_resp(200, bytes)
  end
end

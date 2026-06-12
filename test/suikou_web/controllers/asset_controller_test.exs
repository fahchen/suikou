defmodule SuikouWeb.AssetControllerTest do
  use SuikouWeb.ConnCase, async: true

  import Suikou.Factory

  describe "GET /api/review/:artifact_id/asset/*path" do
    test "serves a file the markdown references relative to its directory", %{conn: conn} do
      %{artifact: artifact} = project_with_asset("docs/guide.md", "img/diagram.png", "PNGDATA")

      conn = get(conn, "/api/review/#{artifact.id}/asset/img/diagram.png")

      assert response(conn, 200) == "PNGDATA"
      assert ["image/png"] = get_resp_header(conn, "content-type")
    end

    test "404 when the reference escapes the project directory", %{conn: conn} do
      %{artifact: artifact} = project_with_asset("docs/guide.md", "img/diagram.png", "PNGDATA")

      conn = get(conn, "/api/review/#{artifact.id}/asset/../../secret")

      assert response(conn, 404)
    end

    test "404 for an unknown artifact", %{conn: conn} do
      conn = get(conn, "/api/review/#{Ecto.UUID.generate()}/asset/img/x.png")

      assert response(conn, 404)
    end

    test "404 when the referenced file is missing", %{conn: conn} do
      %{artifact: artifact} = project_with_asset("docs/guide.md", "img/diagram.png", "PNGDATA")

      conn = get(conn, "/api/review/#{artifact.id}/asset/img/missing.png")

      assert response(conn, 404)
    end
  end

  defp project_with_asset(file_path, asset_path, content) do
    dir = Path.join(System.tmp_dir!(), "suikou-asset-#{System.unique_integer([:positive])}")
    File.mkdir_p!(dir)
    on_exit(fn -> File.rm_rf!(dir) end)

    asset_full = Path.join([dir, Path.dirname(file_path), asset_path])
    File.mkdir_p!(Path.dirname(asset_full))
    File.write!(asset_full, content)

    artifact =
      insert(:artifact,
        file_path: file_path,
        review: build(:review, project: build(:project, path: dir))
      )

    %{artifact: artifact, dir: dir}
  end
end

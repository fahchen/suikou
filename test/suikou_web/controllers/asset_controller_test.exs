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

  describe "GET /api/review/:artifact_id/content" do
    test "serves the artifact's own source file live from disk", %{conn: conn} do
      %{artifact: artifact} = project_with_file("docs/plan.md", "# Plan\n")

      conn = get(conn, "/api/review/#{artifact.id}/content")

      assert response(conn, 200) == "# Plan\n"
      assert ["text/markdown"] = get_resp_header(conn, "content-type")
    end

    test "serves an image artifact with its own media type", %{conn: conn} do
      %{artifact: artifact} = project_with_file("img/logo.png", "PNGDATA")

      conn = get(conn, "/api/review/#{artifact.id}/content")

      assert response(conn, 200) == "PNGDATA"
      assert ["image/png"] = get_resp_header(conn, "content-type")
    end

    test "404 for an unknown artifact", %{conn: conn} do
      conn = get(conn, "/api/review/#{Ecto.UUID.generate()}/content")

      assert response(conn, 404)
    end

    @tag :tmp_dir
    test "serves a git-diff artifact's live diff inline as text/x-diff",
         %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)

      project = insert(:project, path: dir)

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          name: "Diff",
          base_ref: "main",
          head_ref: "topic"
        })

      {:ok, artifact} = Suikou.Reviews.open_file(review, "a.txt")

      conn = get(conn, "/api/review/#{artifact.id}/content")

      body = response(conn, 200)
      assert body =~ "diff --git a/a.txt b/a.txt"
      assert body =~ "+new"
      assert ["text/x-diff"] = get_resp_header(conn, "content-type")
    end

    test "404 when the source file is missing from disk", %{conn: conn} do
      dir = Path.join(System.tmp_dir!(), "suikou-content-#{System.unique_integer([:positive])}")
      File.mkdir_p!(dir)
      on_exit(fn -> File.rm_rf!(dir) end)

      artifact =
        insert(:artifact,
          file_path: "gone.md",
          review: build(:review, project: build(:project, path: dir))
        )

      conn = get(conn, "/api/review/#{artifact.id}/content")

      assert response(conn, 404)
    end
  end

  describe "GET /api/review/:review_id/files/content" do
    @tag :tmp_dir
    test "serves an on-disk file from a file-selection review without minting",
         %{conn: conn, tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project, path: dir)

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

      conn = get(conn, "/api/review/#{review.id}/files/content", path: "plan.md")

      assert response(conn, 200) == "# Plan\n"
      assert ["text/markdown"] = get_resp_header(conn, "content-type")
      assert Suikou.Repo.aggregate(Suikou.Schemas.Artifact, :count) == 0
    end

    @tag :tmp_dir
    test "serves the live diff inline for a git-diff review",
         %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)
      project = insert(:project, path: dir)

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          name: "Diff",
          base_ref: "main",
          head_ref: "topic"
        })

      conn = get(conn, "/api/review/#{review.id}/files/content", path: "a.txt")

      body = response(conn, 200)
      assert body =~ "diff --git a/a.txt b/a.txt"
      assert body =~ "+new"
      assert ["text/x-diff"] = get_resp_header(conn, "content-type")
      assert Suikou.Repo.aggregate(Suikou.Schemas.Artifact, :count) == 0
    end

    @tag :tmp_dir
    test "404 for a path outside the review's file set (whitelist)",
         %{conn: conn, tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "secret.txt"), "shh\n")
      project = insert(:project, path: dir)

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

      conn = get(conn, "/api/review/#{review.id}/files/content", path: "secret.txt")

      assert response(conn, 404)
    end

    @tag :tmp_dir
    test "404 when the path tries to traverse out of the project",
         %{conn: conn, tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project, path: dir)

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

      conn = get(conn, "/api/review/#{review.id}/files/content", path: "../../etc/passwd")

      assert response(conn, 404)
    end

    test "404 when the path query is missing", %{conn: conn} do
      conn = get(conn, "/api/review/#{Ecto.UUID.generate()}/files/content")

      assert response(conn, 404)
    end

    test "404 for an unknown review", %{conn: conn} do
      conn = get(conn, "/api/review/#{Ecto.UUID.generate()}/files/content", path: "anything")

      assert response(conn, 404)
    end
  end

  describe "GET /api/review/:review_id/files/raw" do
    @tag :tmp_dir
    test "serves on-disk image bytes from a file-selection review without minting",
         %{conn: conn, tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "img"))
      File.write!(Path.join(dir, "img/logo.png"), "PNGDATA")
      project = insert(:project, path: dir)

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{name: "Launch", selections: ["img"]})

      conn = get(conn, "/api/review/#{review.id}/files/raw", path: "img/logo.png")

      assert response(conn, 200) == "PNGDATA"
      assert ["image/png"] = get_resp_header(conn, "content-type")
      assert Suikou.Repo.aggregate(Suikou.Schemas.Artifact, :count) == 0
    end

    @tag :tmp_dir
    test "serves the head-ref blob bytes for a git-diff review with the path's media type",
         %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.mkdir_p!(Path.join(dir, "img"))
      File.write!(Path.join(dir, "img/logo.png"), "PNGDATA")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "add image"])
      project = insert(:project, path: dir)

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          name: "Diff",
          base_ref: "main",
          head_ref: "topic"
        })

      conn = get(conn, "/api/review/#{review.id}/files/raw", path: "img/logo.png")

      assert response(conn, 200) == "PNGDATA"
      assert ["image/png"] = get_resp_header(conn, "content-type")
      assert Suikou.Repo.aggregate(Suikou.Schemas.Artifact, :count) == 0
    end

    @tag :tmp_dir
    test "404 for a path outside the review's file set (whitelist)",
         %{conn: conn, tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "secret.png"), "PNGDATA")
      project = insert(:project, path: dir)

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

      conn = get(conn, "/api/review/#{review.id}/files/raw", path: "secret.png")

      assert response(conn, 404)
    end

    @tag :tmp_dir
    test "404 when the path tries to traverse out of the project",
         %{conn: conn, tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project, path: dir)

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{name: "Launch", selections: ["plan.md"]})

      conn = get(conn, "/api/review/#{review.id}/files/raw", path: "../../etc/passwd")

      assert response(conn, 404)
    end

    test "404 when the path query is missing", %{conn: conn} do
      conn = get(conn, "/api/review/#{Ecto.UUID.generate()}/files/raw")
      assert response(conn, 404)
    end

    test "404 for an unknown review", %{conn: conn} do
      conn = get(conn, "/api/review/#{Ecto.UUID.generate()}/files/raw", path: "anything")
      assert response(conn, 404)
    end
  end

  defp init_repo!(dir) do
    File.mkdir_p!(dir)
    git!(dir, ["init", "-q", "-b", "main", "."])
    File.write!(Path.join(dir, "seed.txt"), "seed\n")
    git!(dir, ["add", "."])
    git!(dir, ["commit", "-q", "-m", "seed"])
  end

  defp branch!(dir, name, edit) when is_function(edit, 0) do
    git!(dir, ["checkout", "-q", "-b", name])
    edit.()
    git!(dir, ["add", "."])
    git!(dir, ["commit", "-q", "-m", "topic"])
  end

  defp git!(dir, args) do
    env = [
      {"GIT_AUTHOR_NAME", "Test"},
      {"GIT_AUTHOR_EMAIL", "test@example.com"},
      {"GIT_COMMITTER_NAME", "Test"},
      {"GIT_COMMITTER_EMAIL", "test@example.com"},
      {"GIT_CONFIG_GLOBAL", "/dev/null"},
      {"GIT_CONFIG_SYSTEM", "/dev/null"}
    ]

    {_out, 0} = System.cmd("git", args, cd: dir, env: env, stderr_to_stdout: true)
    :ok
  end

  defp project_with_file(file_path, content) do
    dir = Path.join(System.tmp_dir!(), "suikou-content-#{System.unique_integer([:positive])}")
    File.mkdir_p!(dir)
    on_exit(fn -> File.rm_rf!(dir) end)

    full = Path.join(dir, file_path)
    File.mkdir_p!(Path.dirname(full))
    File.write!(full, content)

    artifact =
      insert(:artifact,
        file_path: file_path,
        review: build(:review, project: build(:project, path: dir))
      )

    %{artifact: artifact, dir: dir}
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

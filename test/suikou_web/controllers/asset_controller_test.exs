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

    # The checkout is the default root, so a report written into the scratch
    # directory reaches the code it is about without naming a root, and reaches
    # a file beside itself by naming one.
    test "an unmarked reference from a scratch artifact reads the checkout",
         %{conn: conn} do
      %{artifact: artifact} = scratch_artifact_with_assets()

      conn = get(conn, "/api/review/#{artifact.id}/asset/docs/diagram.png")

      assert response(conn, 200) == "CHECKOUT"
    end

    test "a @scratch reference from a scratch artifact reads its own root", %{conn: conn} do
      %{artifact: artifact} = scratch_artifact_with_assets()

      conn = get(conn, "/api/review/#{artifact.id}/asset/@scratch/shots/round-3.png")

      assert response(conn, 200) == "SCRATCH"
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

    test "serves TypeScript source as text rather than MPEG transport video", %{conn: conn} do
      for path <- ["src/push.ts", "src/push.tsx", "src/push.mts", "src/push.cts"] do
        %{artifact: artifact} = project_with_file(path, "export const enabled = true\n")

        conn = get(conn, "/api/review/#{artifact.id}/content")

        assert response(conn, 200) == "export const enabled = true\n"
        assert ["text/plain"] = get_resp_header(conn, "content-type")
      end
    end

    test "404 for an unknown artifact", %{conn: conn} do
      conn = get(conn, "/api/review/#{Ecto.UUID.generate()}/content")

      assert response(conn, 404)
    end

    test "sets a content ETag and answers 304 when it matches", %{conn: conn} do
      %{artifact: artifact} = project_with_file("docs/plan.md", "# Plan\n")

      conn = get(conn, "/api/review/#{artifact.id}/content")
      assert [etag] = get_resp_header(conn, "etag")
      assert ["no-cache"] = get_resp_header(conn, "cache-control")

      revalidated =
        build_conn()
        |> put_req_header("if-none-match", etag)
        |> get("/api/review/#{artifact.id}/content")

      assert response(revalidated, 304) == ""
    end

    @tag :tmp_dir
    test "serves a git-diff artifact's live diff inline as text/x-diff",
         %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)

      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          project_path: project_path,
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
          review: build(:review, project: build(:project), project_path: dir)
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
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{
          project_path: project_path,
          name: "Launch",
          selections: ["plan.md"]
        })

      conn = get(conn, "/api/review/#{review.id}/files/content", path: "plan.md")

      assert response(conn, 200) == "# Plan\n"
      assert ["text/markdown"] = get_resp_header(conn, "content-type")
      assert Suikou.Repo.aggregate(Suikou.Schemas.Artifact, :count) == 0
    end

    @tag :tmp_dir
    test "serves TypeScript source as text in an all-files review", %{conn: conn, tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "src"))
      File.write!(Path.join(dir, "src/push.ts"), "export const enabled = true\n")
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{
          project_path: project_path,
          name: "Launch",
          selections: ["src/push.ts"]
        })

      conn = get(conn, "/api/review/#{review.id}/files/content", path: "src/push.ts")

      assert response(conn, 200) == "export const enabled = true\n"
      assert ["text/plain"] = get_resp_header(conn, "content-type")
    end

    @tag :tmp_dir
    test "serves the live diff inline for a git-diff review",
         %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          project_path: project_path,
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
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{
          project_path: project_path,
          name: "Launch",
          selections: ["plan.md"]
        })

      conn = get(conn, "/api/review/#{review.id}/files/content", path: "secret.txt")

      assert response(conn, 404)
    end

    @tag :tmp_dir
    test "404 when the path tries to traverse out of the project",
         %{conn: conn, tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{
          project_path: project_path,
          name: "Launch",
          selections: ["plan.md"]
        })

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

    @tag :tmp_dir
    test "serves a single commit's diff when ?scope=commits:<sha>",
         %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "one\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "add a"])
      {sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha = String.trim(sha)
      File.write!(Path.join(dir, "b.txt"), "two\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "add b"])

      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          project_path: project_path,
          name: "Diff",
          base_ref: "main",
          head_ref: "topic"
        })

      conn =
        get(conn, "/api/review/#{review.id}/files/content",
          path: "a.txt",
          scope: "commits:#{sha}"
        )

      body = response(conn, 200)
      assert body =~ "+one"
      refute body =~ "b.txt"
    end

    @tag :tmp_dir
    test "serves a multi-commit range diff when ?scope=commits:<sha>,<sha>",
         %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "one\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "add a"])
      {sha_a, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha_a = String.trim(sha_a)
      File.write!(Path.join(dir, "a.txt"), "two\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "edit a"])
      {sha_b, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha_b = String.trim(sha_b)

      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          project_path: project_path,
          name: "Diff",
          base_ref: "main",
          head_ref: "topic"
        })

      conn =
        get(conn, "/api/review/#{review.id}/files/content",
          path: "a.txt",
          scope: "commits:#{sha_b},#{sha_a}"
        )

      body = response(conn, 200)
      assert body =~ "+two"
      refute body =~ "+one"
    end

    @tag :tmp_dir
    test "serves the unstaged working-tree diff when ?worktree=unstaged",
         %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "seed.txt"), "committed\n") end)
      File.write!(Path.join(dir, "seed.txt"), "worktree edit\n")

      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          project_path: project_path,
          name: "Diff",
          base_ref: "main",
          head_ref: "topic"
        })

      conn =
        get(conn, "/api/review/#{review.id}/files/content",
          path: "seed.txt",
          worktree: "unstaged"
        )

      body = response(conn, 200)
      assert body =~ "+worktree edit"
    end

    @tag :tmp_dir
    test "400 when scope=commits is combined with worktree=staged",
         %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)
      {sha, 0} = System.cmd("git", ["rev-parse", "HEAD"], cd: dir)
      sha = String.trim(sha)

      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          project_path: project_path,
          name: "Diff",
          base_ref: "main",
          head_ref: "topic"
        })

      conn =
        get(conn, "/api/review/#{review.id}/files/content",
          path: "a.txt",
          scope: "commits:#{sha}",
          worktree: "staged"
        )

      assert response(conn, 400)
    end

    @tag :tmp_dir
    test "400 when scope=commits has an invalid hex sha", %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          project_path: project_path,
          name: "Diff",
          base_ref: "main",
          head_ref: "topic"
        })

      conn =
        get(conn, "/api/review/#{review.id}/files/content", path: "a.txt", scope: "commits:zzz")

      assert response(conn, 400)
    end

    @tag :tmp_dir
    test "400 when scope=commits is empty", %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          project_path: project_path,
          name: "Diff",
          base_ref: "main",
          head_ref: "topic"
        })

      conn = get(conn, "/api/review/#{review.id}/files/content", path: "a.txt", scope: "commits:")

      assert response(conn, 400)
    end

    @tag :tmp_dir
    test "400 for an unknown scope keyword", %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      branch!(dir, "topic", fn -> File.write!(Path.join(dir, "a.txt"), "new\n") end)
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          project_path: project_path,
          name: "Diff",
          base_ref: "main",
          head_ref: "topic"
        })

      conn =
        get(conn, "/api/review/#{review.id}/files/content", path: "a.txt", scope: "nonsense")

      assert response(conn, 400)
    end
  end

  describe "GET /api/review/:review_id/files/raw" do
    @tag :tmp_dir
    test "serves on-disk image bytes from a file-selection review without minting",
         %{conn: conn, tmp_dir: dir} do
      File.mkdir_p!(Path.join(dir, "img"))
      File.write!(Path.join(dir, "img/logo.png"), "PNGDATA")
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{
          project_path: project_path,
          name: "Launch",
          selections: ["img"]
        })

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
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          project_path: project_path,
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
    test "serves a TypeScript blob from a git-diff review as text", %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "push.ts"), "export const enabled = true\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "add TypeScript source"])
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          project_path: project_path,
          name: "Diff",
          base_ref: "main",
          head_ref: "topic"
        })

      conn = get(conn, "/api/review/#{review.id}/files/raw", path: "push.ts")

      assert response(conn, 200) == "export const enabled = true\n"
      assert ["text/plain"] = get_resp_header(conn, "content-type")
    end

    @tag :tmp_dir
    test "404 for a path outside the review's file set (whitelist)",
         %{conn: conn, tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      File.write!(Path.join(dir, "secret.png"), "PNGDATA")
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{
          project_path: project_path,
          name: "Launch",
          selections: ["plan.md"]
        })

      conn = get(conn, "/api/review/#{review.id}/files/raw", path: "secret.png")

      assert response(conn, 404)
    end

    @tag :tmp_dir
    test "404 when the path tries to traverse out of the project",
         %{conn: conn, tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{
          project_path: project_path,
          name: "Launch",
          selections: ["plan.md"]
        })

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

  describe "GET /api/review/:review_id/commits" do
    @tag :tmp_dir
    test "lists a diff review's commit range as JSON, newest first",
         %{conn: conn, tmp_dir: dir} do
      init_repo!(dir)
      git!(dir, ["checkout", "-q", "-b", "topic"])
      File.write!(Path.join(dir, "a.txt"), "one\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "first"])
      File.write!(Path.join(dir, "b.txt"), "two\n")
      git!(dir, ["add", "."])
      git!(dir, ["commit", "-q", "-m", "second"])

      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_diff_review(project, %{
          project_path: project_path,
          name: "Diff",
          base_ref: "main",
          head_ref: "topic"
        })

      conn = get(conn, "/api/review/#{review.id}/commits")

      assert %{
               "commits" => [
                 %{"sha" => sha2, "subject" => "second"},
                 %{"sha" => _sha1, "subject" => "first"}
               ]
             } =
               json_response(conn, 200)

      assert String.match?(sha2, ~r/^[0-9a-f]{40}$/)
    end

    @tag :tmp_dir
    test "404 for a file-selection review", %{conn: conn, tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project)
      project_path = dir

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{
          project_path: project_path,
          name: "Launch",
          selections: ["plan.md"]
        })

      conn = get(conn, "/api/review/#{review.id}/commits")

      assert response(conn, 404)
    end

    test "404 for an unknown review", %{conn: conn} do
      conn = get(conn, "/api/review/#{Ecto.UUID.generate()}/commits")

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
        review: build(:review, project: build(:project), project_path: dir)
      )

    %{artifact: artifact, dir: dir}
  end

  defp scratch_artifact_with_assets do
    dir = Path.join(System.tmp_dir!(), "suikou-asset-#{System.unique_integer([:positive])}")
    scratch = Path.join(System.tmp_dir!(), "suikou-scratch-#{System.unique_integer([:positive])}")
    File.mkdir_p!(Path.join(dir, "docs"))
    File.mkdir_p!(Path.join(scratch, "shots"))
    on_exit(fn -> File.rm_rf!(dir) && File.rm_rf!(scratch) end)

    File.write!(Path.join([dir, "docs", "diagram.png"]), "CHECKOUT")
    File.write!(Path.join([scratch, "shots", "round-3.png"]), "SCRATCH")

    artifact =
      insert(:artifact,
        file_path: "@scratch/report.md",
        review: build(:review, project: build(:project), project_path: dir, scratch_path: scratch)
      )

    %{artifact: artifact}
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
        review: build(:review, project: build(:project), project_path: dir)
      )

    %{artifact: artifact, dir: dir}
  end
end

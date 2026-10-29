defmodule SuikouWeb.CLIRoutesTest do
  @moduledoc """
  Drives the loopback CLI API through the endpoint: the token gate, and every
  route of the `/api/cli` scope, proving the request body reaches the same
  `AgentCLI` command the rpc transport used to call and pinning the status code
  and JSON shape of its answer. `server/stop` has no case here: it stops the
  node, so a call would end the test run.
  """

  use SuikouWeb.ConnCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Projects
  alias Suikou.Reads
  alias Suikou.Schemas.Artifact
  alias Suikou.Submissions
  alias SuikouWeb.CLI.Access
  alias SuikouWeb.Endpoint

  # The reviewing agent the comment and reply cases act as; the name is required.
  @agent %{name: "Codex", icon: "\u{1F916}"}

  describe "the :cli pipeline" do
    test "rejects a request without a token" do
      conn = post_json(build_conn(), "/api/cli/project/list", %{})

      assert json_response(conn, 401) == %{"error" => "unauthorized"}
    end

    test "rejects a request with the wrong token" do
      conn =
        build_conn()
        |> put_req_header("authorization", "Bearer not-the-token")
        |> post_json("/api/cli/project/list", %{})

      assert json_response(conn, 401) == %{"error" => "unauthorized"}
    end
  end

  describe "project routes" do
    test "list answers with the same JSON the command returns" do
      insert(:project, name: "Docs")

      conn = post_json(authorized(), "/api/cli/project/list", %{})

      assert %{
               "projects" => [
                 %{
                   "id" => id,
                   "name" => "Docs",
                   "identity" => nil,
                   "respect_gitignore" => true,
                   "instructions" => []
                 }
               ]
             } = json_response(conn, 200)

      assert is_binary(id)
    end

    @tag :tmp_dir
    test "create answers with the new project id", %{tmp_dir: dir} do
      conn =
        post_json(authorized(), "/api/cli/project/create", %{"name" => "Docs", "path" => dir})

      assert %{"project_id" => id, "error" => nil} = json_response(conn, 200)
      assert is_binary(id)
    end
  end

  describe "review routes" do
    test "list answers with the project's review summaries" do
      review = insert(:review, name: "Spec")

      conn =
        post_json(authorized(), "/api/cli/review/list", %{"project_id" => review.project_id})

      assert %{
               "reviews" => [
                 %{
                   "id" => id,
                   "name" => "Spec",
                   "kind" => "file_selection",
                   "selections" => [],
                   "stack_ref" => nil,
                   "project_id" => project_id,
                   "project_path" => project_path,
                   "scratch_path" => scratch_path
                 }
               ],
               "error" => nil
             } = json_response(conn, 200)

      assert id == review.id
      assert project_id == review.project_id
      assert is_binary(project_path)
      assert is_binary(scratch_path)
    end

    @tag :tmp_dir
    test "create answers with the new review id and scratch path", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      {:ok, project} = Projects.register_project(%{name: "Docs", path: dir})

      conn =
        post_json(authorized(), "/api/cli/review/create", %{
          "project_id" => project.id,
          "project_path" => dir,
          "name" => "Launch",
          "selections" => ["plan.md"]
        })

      assert %{"review_id" => id, "scratch_path" => scratch, "error" => nil} =
               json_response(conn, 200)

      assert is_binary(id)
      assert String.ends_with?(scratch, id)
    end

    test "show answers with the review metadata, files, and instructions" do
      review = insert(:review, name: "Spec")

      conn = post_json(authorized(), "/api/cli/review/show", %{"review_id" => review.id})

      assert %{
               "id" => id,
               "name" => "Spec",
               "kind" => "file_selection",
               "selections" => [],
               "stack_ref" => nil,
               "files" => [],
               "instructions" => [],
               "error" => nil
             } = json_response(conn, 200)

      assert id == review.id
    end

    test "show answers with the command's not-found error" do
      conn =
        post_json(authorized(), "/api/cli/review/show", %{"review_id" => Ecto.UUID.generate()})

      assert %{"error" => "review_not_found"} = json_response(conn, 200)
    end

    test "list-files answers with the review's covered files" do
      %{review: review, path: path} = covered_file("line 1\n")

      conn = post_json(authorized(), "/api/cli/review/list-files", %{"review_id" => review.id})

      assert %{"files" => [%{"path" => ^path, "artifact_id" => nil}], "error" => nil} =
               json_response(conn, 200)
    end

    test "url answers with the review's board URL" do
      review = insert(:review)

      conn = post_json(authorized(), "/api/cli/review/url", %{"review_id" => review.id})

      assert %{"url" => url, "error" => nil} = json_response(conn, 200)
      assert url == Endpoint.url() <> "/reviews/" <> review.id
    end

    test "rename answers with no error" do
      review = insert(:review)

      conn =
        post_json(authorized(), "/api/cli/review/rename", %{
          "review_id" => review.id,
          "name" => "Renamed"
        })

      assert json_response(conn, 200) == %{"error" => nil}
    end

    @tag :tmp_dir
    test "set-files answers with no error", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = insert(:review, project_path: dir)

      conn =
        post_json(authorized(), "/api/cli/review/set-files", %{
          "review_id" => review.id,
          "files" => ["plan.md"]
        })

      assert json_response(conn, 200) == %{"error" => nil}
    end

    test "set-stack answers with the command's error for a file-selection review" do
      review = insert(:review)

      conn =
        post_json(authorized(), "/api/cli/review/set-stack", %{
          "review_id" => review.id,
          "stack_ref" => "topic-review"
        })

      assert json_response(conn, 200) == %{"error" => "not_a_diff_review"}
    end

    @tag :tmp_dir
    test "add-files answers with no error", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = insert(:review, project_path: dir)

      conn =
        post_json(authorized(), "/api/cli/review/add-files", %{
          "review_id" => review.id,
          "files" => ["plan.md"]
        })

      assert json_response(conn, 200) == %{"error" => nil}
    end

    @tag :tmp_dir
    test "remove-files answers with no error", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      review = insert(:review, project_path: dir)

      conn =
        post_json(authorized(), "/api/cli/review/remove-files", %{
          "review_id" => review.id,
          "files" => ["plan.md"]
        })

      assert json_response(conn, 200) == %{"error" => nil}
    end

    test "delete answers with no error" do
      review = insert(:review)

      conn = post_json(authorized(), "/api/cli/review/delete", %{"review_id" => review.id})

      assert json_response(conn, 200) == %{"error" => nil}
    end

    test "export answers with the latest-round critique snapshot" do
      round = source_round("line 1\n")
      %Artifact{review_id: review_id} = Reads.get_artifact(round.artifact_id)

      conn = post_json(authorized(), "/api/cli/review/export", %{"review_id" => review_id})

      assert %{
               "review_id" => ^review_id,
               "submission_version" => 0,
               "artifacts" => [%{"comments" => []}]
             } = json_response(conn, 200)
    end

    test "wait answers with the snapshot of a round already submitted" do
      round = insert(:round)
      %Artifact{review_id: review_id} = Reads.get_artifact(round.artifact_id)
      {:ok, _result} = Submissions.submit(round.id)

      conn =
        post_json(authorized(), "/api/cli/review/wait", %{
          "review_id" => review_id,
          "until_round" => 1
        })

      assert %{"review_id" => ^review_id, "submission_version" => 1, "artifacts" => [_artifact]} =
               json_response(conn, 200)
    end

    # config/test.exs caps the poll window at 200ms, so the timeout returns promptly.
    test "wait answers with a timeout when no submission lands in the window" do
      review = insert(:review)

      conn = post_json(authorized(), "/api/cli/review/wait", %{"review_id" => review.id})

      assert json_response(conn, 200) == %{"status" => "timeout", "submission_version" => 0}
    end

    test "notify answers with the delivered count" do
      review = insert(:review)

      conn =
        post_json(authorized(), "/api/cli/review/notify", %{
          "review_id" => review.id,
          "message" => "Addressed round 1"
        })

      assert json_response(conn, 200) == %{"delivered" => 0, "error" => nil}
    end
  end

  describe "comment routes" do
    setup :with_comment

    test "add answers with the new comment id" do
      %{review: review, path: path} = covered_file("line 1\n")

      conn =
        post_json(authorized(), "/api/cli/comment/add", %{
          "review_id" => review.id,
          "path" => path,
          "scope" => "artifact",
          "critique_type" => "note",
          "body" => "please clarify",
          "as" => "Codex"
        })

      assert %{"comment_id" => id, "error" => nil} = json_response(conn, 200)
      assert is_binary(id)
    end

    test "reply answers with the new reply id", %{comment: comment} do
      conn =
        post_json(authorized(), "/api/cli/comment/reply", %{
          "comment_id" => comment.id,
          "body" => "fixed",
          "as" => "Codex"
        })

      assert %{"reply_id" => id, "error" => nil} = json_response(conn, 200)
      assert is_binary(id)
    end

    test "resolve answers with the comment id", %{comment: comment} do
      conn =
        post_json(authorized(), "/api/cli/comment/resolve", %{
          "comment_id" => comment.id,
          "as" => "Codex"
        })

      assert json_response(conn, 200) == %{"comment_id" => comment.id, "error" => nil}
    end

    test "reopen answers with the comment id", %{comment: comment} do
      {:ok, _resolved} = Critique.resolve_comment(comment.id)

      conn = post_json(authorized(), "/api/cli/comment/reopen", %{"comment_id" => comment.id})

      assert json_response(conn, 200) == %{"comment_id" => comment.id, "error" => nil}
    end

    test "react answers with the comment id", %{comment: comment} do
      conn =
        post_json(authorized(), "/api/cli/comment/react", %{
          "comment_id" => comment.id,
          "emoji" => "\u{1F440}",
          "as" => "Codex"
        })

      assert json_response(conn, 200) == %{"comment_id" => comment.id, "error" => nil}
    end

    test "unreact answers with the comment id", %{comment: comment} do
      {:ok, _comment_id} = Critique.react_as_agent(comment.id, "\u{1F440}", @agent)

      conn =
        post_json(authorized(), "/api/cli/comment/unreact", %{
          "comment_id" => comment.id,
          "as" => "Codex"
        })

      assert json_response(conn, 200) == %{"comment_id" => comment.id, "error" => nil}
    end
  end

  describe "reply routes" do
    setup [:with_comment, :with_reply]

    test "react answers with the reply id", %{reply: reply} do
      conn =
        post_json(authorized(), "/api/cli/reply/react", %{
          "reply_id" => reply.id,
          "emoji" => "\u{1F440}",
          "as" => "Codex"
        })

      assert json_response(conn, 200) == %{"reply_id" => reply.id, "error" => nil}
    end

    test "unreact answers with the reply id", %{reply: reply} do
      {:ok, _comment_id} = Critique.react_reply_as_agent(reply.id, "\u{1F440}", @agent)

      conn =
        post_json(authorized(), "/api/cli/reply/unreact", %{
          "reply_id" => reply.id,
          "as" => "Codex"
        })

      assert json_response(conn, 200) == %{"reply_id" => reply.id, "error" => nil}
    end
  end

  describe "server routes" do
    test "url answers with the endpoint URL" do
      conn = post_json(authorized(), "/api/cli/server/url", %{})

      assert json_response(conn, 200) == %{"url" => Endpoint.url(), "error" => nil}
    end

    test "pid answers with the OS pid" do
      conn = post_json(authorized(), "/api/cli/server/pid", %{})

      assert %{"pid" => pid, "error" => nil} = json_response(conn, 200)
      assert pid == List.to_string(:os.getpid())
    end
  end

  defp with_comment(_context) do
    round = source_round("line 1\n")
    %{comment: published_comment(round.id, %{body: "please clarify"})}
  end

  defp with_reply(%{comment: comment}) do
    {:ok, reply} = Critique.reply_as_agent(comment.id, "fixed", @agent)
    %{reply: reply}
  end

  defp authorized(conn \\ build_conn()) do
    put_req_header(conn, "authorization", "Bearer " <> Access.token())
  end

  defp post_json(conn, path, payload) do
    conn
    |> put_req_header("content-type", "application/json")
    |> post(path, Jason.encode!(payload))
  end
end

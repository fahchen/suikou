defmodule SuikouWeb.AgentCLI.ReviewsTest do
  use Suikou.DataCase

  import ExUnit.CaptureIO
  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Reads
  alias Suikou.Reviews
  alias Suikou.Schemas.Artifact
  alias Suikou.Submissions
  alias SuikouWeb.AgentCLI.Reviews, as: CLI
  alias SuikouWeb.Stores.BoardBroadcast
  alias SuikouWeb.Stores.CommentBroadcast

  describe "list/0" do
    test "emits a project's reviews" do
      review = insert(:review, name: "Spec")

      assert %{"reviews" => [%{"id" => id, "name" => "Spec", "kind" => "file_selection"}]} =
               run(%{"project_id" => review.project_id}, &CLI.list/0)

      assert id == review.id
    end

    test "emits project_not_found for an unknown project" do
      assert %{"reviews" => [], "error" => "project_not_found"} =
               run(%{"project_id" => Ecto.UUID.generate()}, &CLI.list/0)
    end
  end

  describe "create/0" do
    @tag :tmp_dir
    test "creates a review, broadcasts the board, and emits its id", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      {:ok, project} = Suikou.Projects.register_project(%{name: "Docs", path: dir})
      :ok = BoardBroadcast.subscribe()

      payload = %{"project_id" => project.id, "name" => "Launch", "selections" => ["plan.md"]}

      assert %{"review_id" => id, "error" => nil} = run(payload, &CLI.create/0)
      assert is_binary(id)
      assert_receive :board_changed
    end

    test "emits project_not_found for an unknown project" do
      payload = %{"project_id" => Ecto.UUID.generate(), "name" => "X", "selections" => []}

      assert %{"review_id" => nil, "error" => "project_not_found"} = run(payload, &CLI.create/0)
    end
  end

  describe "show/0" do
    test "emits the review metadata and its files" do
      review = insert(:review, name: "Spec")

      assert %{"id" => id, "name" => "Spec", "kind" => "file_selection", "files" => []} =
               run(%{"review_id" => review.id}, &CLI.show/0)

      assert id == review.id
    end

    test "emits review_not_found for an unknown review" do
      assert %{"error" => "review_not_found"} =
               run(%{"review_id" => Ecto.UUID.generate()}, &CLI.show/0)
    end
  end

  describe "files/0" do
    test "emits the review's current files" do
      review = insert(:review)

      assert %{"files" => [], "error" => nil} =
               run(%{"review_id" => review.id}, &CLI.files/0)
    end

    test "emits review_not_found for an unknown review" do
      assert %{"files" => [], "error" => "review_not_found"} =
               run(%{"review_id" => Ecto.UUID.generate()}, &CLI.files/0)
    end
  end

  describe "url/0" do
    test "emits the review's URL ending in /reviews/<id>" do
      review = insert(:review)

      assert %{"url" => url, "error" => nil} = run(%{"review_id" => review.id}, &CLI.url/0)
      assert String.starts_with?(url, "http://")
      assert String.ends_with?(url, "/reviews/#{review.id}")
    end
  end

  describe "rename/0" do
    test "renames the review and broadcasts the board" do
      review = insert(:review)
      :ok = BoardBroadcast.subscribe()

      assert %{"error" => nil} =
               run(%{"review_id" => review.id, "name" => "Renamed"}, &CLI.rename/0)

      assert %{name: "Renamed"} = Reviews.get_review(review.id)
      assert_receive :board_changed
    end

    test "emits review_not_found for an unknown review" do
      assert %{"error" => "review_not_found"} =
               run(%{"review_id" => Ecto.UUID.generate(), "name" => "X"}, &CLI.rename/0)
    end
  end

  describe "set_files/0" do
    @tag :tmp_dir
    test "replaces the selection and broadcasts the board", %{tmp_dir: dir} do
      File.write!(Path.join(dir, "plan.md"), "# Plan\n")
      project = insert(:project, path: dir)
      review = insert(:review, project: project)
      :ok = BoardBroadcast.subscribe()

      assert %{"error" => nil} =
               run(%{"review_id" => review.id, "files" => ["plan.md"]}, &CLI.set_files/0)

      assert_receive :board_changed
    end

    test "emits review_not_found for an unknown review" do
      assert %{"error" => "review_not_found"} =
               run(%{"review_id" => Ecto.UUID.generate(), "files" => []}, &CLI.set_files/0)
    end
  end

  describe "delete/0" do
    test "deletes the review and broadcasts the board" do
      review = insert(:review)
      :ok = BoardBroadcast.subscribe()

      assert %{"error" => nil} = run(%{"review_id" => review.id}, &CLI.delete/0)
      assert Reviews.get_review(review.id) == nil
      assert_receive :board_changed
    end

    test "emits review_not_found for an unknown review" do
      assert %{"error" => "review_not_found"} =
               run(%{"review_id" => Ecto.UUID.generate()}, &CLI.delete/0)
    end
  end

  describe "export/0" do
    test "emits the latest-round critique snapshot by default" do
      round = source_round("line 1\nline 2\n")
      %Artifact{review_id: review_id} = Reads.get_artifact(round.artifact_id)

      assert %{"review_id" => ^review_id, "submission_version" => 0, "artifacts" => [_artifact]} =
               run(%{"review_id" => review_id}, &CLI.export/0)
    end

    test "emits review_not_found for an unknown review" do
      assert %{"error" => "review_not_found"} =
               run(%{"review_id" => Ecto.UUID.generate()}, &CLI.export/0)
    end
  end

  describe "wait/0" do
    # config/test.exs caps the poll window at 200ms, so the timeout branch
    # returns promptly when no submission lands.
    test "emits a timeout snapshot when no submission lands in the window" do
      review = insert(:review)

      assert %{"status" => "timeout", "submission_version" => 0} =
               run(%{"review_id" => review.id}, &CLI.wait/0)
    end

    test "emits review_not_found for an unknown review" do
      assert %{"error" => "review_not_found"} =
               run(%{"review_id" => Ecto.UUID.generate()}, &CLI.wait/0)
    end

    test "emits the export snapshot when a submission raises the count" do
      round = insert(:round)
      %Artifact{review_id: review_id} = Reads.get_artifact(round.artifact_id)
      payload = Jason.encode!(%{"review_id" => review_id})

      task =
        Task.async(fn ->
          capture_io([input: payload], &CLI.wait/0)
        end)

      # Wait until the poll task is blocked in its `receive` (version captured at
      # the current count of 0) before raising the count, so the wake is a real
      # increase rather than a no-op recompute.
      wait_until_waiting(task.pid)
      {:ok, _result} = Submissions.submit(round.id, :comment)
      CommentBroadcast.broadcast(review_id)

      assert %{"review_id" => ^review_id, "submission_version" => 1} =
               task |> Task.await() |> Jason.decode!()
    end

    test "the default snapshot drops resolved and already-answered comments" do
      round = insert(:round)
      %Artifact{review_id: review_id} = Reads.get_artifact(round.artifact_id)

      answered = published_comment(round.id, %{body: "answered"})
      {:ok, _agent} = Critique.reply_as_agent(answered.id, "fixed")
      published_comment(round.id, %{body: "open"})

      # Advance once so both comments carry forward; the wake submission below
      # advances again, so the snapshot reflects that newest draft round, where
      # the answered comment is a reply-less carry-forward copy.
      %{round: round1} = advance(round.artifact_id, "v1\n")
      payload = Jason.encode!(%{"review_id" => review_id})

      task = Task.async(fn -> capture_io([input: payload], &CLI.wait/0) end)

      wait_until_waiting(task.pid)
      {:ok, _result} = Submissions.submit(round1.id, :comment)
      CommentBroadcast.broadcast(review_id)

      assert %{"artifacts" => [%{"comments" => comments}]} =
               task |> Task.await() |> Jason.decode!()

      assert Enum.map(comments, & &1["body"]) == ["open"]
    end
  end

  defp run(payload, fun) do
    [input: Jason.encode!(payload)]
    |> capture_io(fun)
    |> Jason.decode!()
  end

  # Block until the poll task is parked in `await/4`'s `receive` — i.e. it has
  # already subscribed and captured the version. Matching on the current stacktrace
  # (not a bare `:waiting` status) avoids racing the brief `:waiting` the earlier
  # `Repo` lookup in `poll/0` produces, before the subscription exists.
  defp wait_until_waiting(pid) do
    with {:status, :waiting} <- Process.info(pid, :status),
         {:current_stacktrace, stack} <- Process.info(pid, :current_stacktrace),
         true <- Enum.any?(stack, &match?({CLI, :await, 4, _location}, &1)) do
      :ok
    else
      _other -> wait_until_waiting(pid)
    end
  end
end

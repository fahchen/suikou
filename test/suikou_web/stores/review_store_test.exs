defmodule SuikouWeb.Stores.ReviewStoreTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Musubi.Socket
  alias Musubi.Testing
  alias Suikou.Events
  alias Suikou.Reads
  alias Suikou.Repo
  alias Suikou.Reviews
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Round
  alias Suikou.Submissions
  alias SuikouWeb.Stores.ReviewStore

  describe "submit_review" do
    test "broadcasts and advances only files with a draft verdict" do
      %{review: review} = file_selection_review(["first.md", "second.md"])
      {:ok, drafted_artifact} = Reviews.open_file(review, "first.md")
      {:ok, comment_only_artifact} = Reviews.open_file(review, "second.md")
      drafted = Rounds.latest(drafted_artifact.id)
      comment_only = Rounds.latest(comment_only_artifact.id)

      {:ok, _round} = Submissions.set_draft_verdict(drafted.id, :request_changes)

      pending_comment(comment_only.id, %{
        scope: :review,
        critique_type: :note,
        body: "publish me"
      })

      %Artifact{review_id: review_id} = Reads.get_artifact(drafted.artifact_id)
      Events.subscribe(review_id)

      page = mount_review(review_id)

      {:ok, %{warnings: []}} = Testing.dispatch_command(page, :submit_review, %{})

      assert_receive {:review_changed, ^review_id, _artifact_id}
      assert %Round{number: 1} = Rounds.latest(drafted_artifact.id)
      assert %Round{number: 0} = Rounds.latest(comment_only_artifact.id)

      [published] = Reads.list_comments(comment_only)
      assert %{status: :published} = published
    end
  end

  describe "load_review_structure" do
    test "replies with chrome, file entries, and per-file content identity" do
      %{review: review} = file_selection_review(["first.md", "second.md"])
      {:ok, first} = Reviews.open_file(review, "first.md")
      review_id = review.id
      first_id = first.id

      page = mount_review(review_id)

      {:ok, reply} = Testing.dispatch_command(page, :load_review_structure, %{})

      assert %{review_id: ^review_id, exists: true, name: "rv", kind: :file} = reply
      assert Enum.map(reply.file_entries, & &1.path) == ["first.md", "second.md"]

      minted = Enum.find(reply.files, &(&1.path == "first.md"))
      assert %{artifact_id: ^first_id, artifact: %{id: ^first_id, title: "first.md"}} = minted
      assert %{current_round: %{content_hash: hash}} = minted
      assert is_binary(hash)

      unminted = Enum.find(reply.files, &(&1.path == "second.md"))
      assert %{artifact_id: nil, artifact: nil, current_round: nil} = unminted
    end

    test "flags a gone review with exists: false so the client shows review-not-found" do
      page = mount_review("00000000-0000-7000-8000-000000000000")

      assert {:ok, %{exists: false, name: "", kind: :file, file_entries: [], files: []}} =
               Testing.dispatch_command(page, :load_review_structure, %{})
    end
  end

  describe "review root" do
    test "renders an empty snapshot when the review is gone" do
      page = mount_review("00000000-0000-7000-8000-000000000000")

      assert %{review_id: "00000000-0000-7000-8000-000000000000"} = Testing.render(page)
      assert %{files: [], structure_version: 0} = Testing.render(page, ["body"])
    end

    test "handle_info refreshes the body, and targets one file on an artifact-scoped change" do
      socket = %Socket{assigns: %{review_id: "rv"}}

      # Review-level change (nil artifact): the body reloads its full structure,
      # no file subtree is targeted.
      assert {:noreply, ^socket} = ReviewStore.handle_info({:review_changed, "rv", nil}, socket)
      assert_received {:musubi_send_update, ["body"], %{reload: :structure}}
      refute_received {:musubi_send_update, ["body", "files", _id], _assigns}

      # Artifact-scoped change: the body reloads aggregates only, plus that file's
      # store and its comment thread.
      assert {:noreply, ^socket} =
               ReviewStore.handle_info({:review_changed, "rv", "art-1"}, socket)

      assert_received {:musubi_send_update, ["body"], %{reload: :aggregates}}
      assert_received {:musubi_send_update, ["body", "files", "art-1"], %{}}
      assert_received {:musubi_send_update, ["body", "files", "art-1", "comments"], %{}}
    end

    test "add_comment on an unminted file mints instead of crashing the page server" do
      # An unminted file's FileStore is mounted with artifact_id: nil, which is
      # dropped from assigns — the key is absent, not nil. The first comment must
      # mint the artifact, not raise KeyError and tear down the connection.
      %{review: review} = file_selection_review(["first.md", "second.md"])
      review_id = review.id

      page = mount_review(review_id)
      await_files(page)

      _result =
        Testing.dispatch_command(
          page,
          :add_comment,
          %{"scope" => "review", "critique_type" => "note", "body" => "mint me"},
          ["body", "files", "second.md"]
        )

      assert Enum.any?(Reads.list_review_artifacts(review_id), &(&1.file_path == "second.md"))
    end

    test "renders one child per covered file and keeps unminted files empty" do
      %{review: review} = file_selection_review(["first.md", "second.md"])
      {:ok, first} = Reviews.open_file(review, "first.md")
      review_id = review.id
      first_id = first.id

      page = mount_review(review_id)
      assert %{review_id: ^review_id} = Testing.render(page)

      %{files: files} = await_files(page)
      assert length(files) == 2

      assert find_file_child(files, "first.md").id == first_id
      assert find_file_child(files, "second.md").id == "second.md"

      assert %{path: "first.md", current_round: %{number: 0}} =
               Testing.render(page, ["body", "files", first_id])

      assert %{path: "second.md", current_round: %{number: 0}} =
               Testing.render(page, ["body", "files", "second.md"])
    end
  end

  defp mount_review(review_id) do
    Testing.mount(ReviewStore, %{"review_id" => review_id})
  end

  defp find_file_child(files, path) do
    Enum.find(files, &(&1.assigns.path == path))
  end

  # Re-renders the body until its async file list resolves into rendered file
  # children. Blocks on the resolution patch rather than spinning, so the load
  # task finishes before the sandbox connection is reclaimed. Only used by
  # callers that expect at least one file.
  defp await_files(page) do
    snapshot = Testing.render(page, ["body"])

    case snapshot.files do
      [] ->
        assert_receive {:patch, _envelope}
        await_files(page)

      _files ->
        snapshot
    end
  end

  defp file_selection_review(paths) do
    tmp =
      Path.join(
        System.tmp_dir!(),
        "suikou-review-store-#{System.unique_integer([:positive])}"
      )

    File.mkdir_p!(tmp)

    Enum.each(paths, fn path ->
      full_path = Path.join(tmp, path)
      File.mkdir_p!(Path.dirname(full_path))
      File.write!(full_path, "#{path}\n")
    end)

    on_exit(fn -> File.rm_rf!(tmp) end)

    project = insert(:project, path: tmp)

    {:ok, review} =
      Reviews.create_review(project, %{
        name: "rv",
        selections: paths
      })

    %{project: project, review: Repo.preload(review, :project)}
  end
end

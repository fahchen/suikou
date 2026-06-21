defmodule SuikouWeb.Stores.ReviewStoreTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Musubi.Socket
  alias Musubi.Testing
  alias Suikou.Reads
  alias Suikou.Repo
  alias Suikou.Reviews
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Round
  alias Suikou.Submissions
  alias SuikouWeb.Stores.CommentBroadcast
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
      CommentBroadcast.subscribe(review_id)

      page = mount_review(review_id)

      {:ok, %{warnings: []}} = Testing.dispatch_command(page, :submit_review, %{})

      assert_receive :comments_changed
      assert %Round{number: 1} = Rounds.latest(drafted_artifact.id)
      assert %Round{number: 0} = Rounds.latest(comment_only_artifact.id)

      [published] = Reads.list_comments(comment_only)
      assert %{status: :published} = published
    end
  end

  describe "review root" do
    test "renders an empty snapshot when the review is gone" do
      page = mount_review("00000000-0000-7000-8000-000000000000")

      assert %{review_id: "00000000-0000-7000-8000-000000000000"} = Testing.render(page)
      assert %{name: "", files: []} = Testing.render(page, ["body"])
    end

    test "handle_info(:comments_changed) forwards a refresh to the body child" do
      socket = %Socket{assigns: %{review_id: "rv"}}

      assert {:noreply, ^socket} = ReviewStore.handle_info(:comments_changed, socket)
      assert_received {:musubi_send_update, ["body"], %{}}
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

      assert %{artifact_id: ^first_id, current_round: %{number: 0}} =
               Testing.render(page, ["body", "files", first_id])

      assert %{artifact_id: nil, current_round: %{number: 0}, artifact: %{title: "second.md"}} =
               Testing.render(page, ["body", "files", "second.md"])
    end
  end

  defp mount_review(review_id) do
    Testing.mount(ReviewStore, %{"review_id" => review_id})
  end

  defp find_file_child(files, path) do
    Enum.find(files, &(&1.assigns.path == path))
  end

  defp await_files(page, attempts \\ 5)

  defp await_files(page, attempts) when attempts > 0 do
    _state = :sys.get_state(page.pid)
    snapshot = Testing.render(page, ["body"])

    if snapshot.files == [] do
      await_files(page, attempts - 1)
    else
      snapshot
    end
  end

  defp await_files(page, 0), do: Testing.render(page, ["body"])

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

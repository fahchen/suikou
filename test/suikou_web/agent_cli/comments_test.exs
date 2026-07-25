defmodule SuikouWeb.AgentCLI.CommentsTest do
  use Suikou.DataCase

  import ExUnit.CaptureIO
  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Events
  alias Suikou.Reads
  alias Suikou.Repo
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.ReviewSource.FileSelection
  alias SuikouWeb.AgentCLI.Comments

  describe "add/0" do
    test "mints the file's artifact and publishes under the calling agent's name" do
      %{review: review, path: path} = covered_file(Enum.map_join(1..12, "\n", &"line #{&1}") <> "\n")
      review_id = review.id
      Events.subscribe(review_id)

      assert %{"comment_id" => id, "error" => nil} =
               run(
                 %{
                   "review_id" => review_id,
                   "path" => path,
                   "scope" => "located",
                   "critique_type" => "fix_required",
                   "body" => "off by one",
                   "anchor" => %{"type" => "line_range", "start_line" => 10, "end_line" => 12},
                   "as" => "Codex",
                   "icon" => "\u{1F916}"
                 },
                 &Comments.add/0
               )

      assert %Comment{
               author: :agent,
               author_name: "Codex",
               author_icon: "\u{1F916}",
               status: :published
             } = Repo.get!(Comment, id)

      # The human had not opened this file, so the artifact did not exist until
      # the comment landed — a reviewing agent gets there first.
      assert [%Artifact{file_path: ^path}] = Repo.all(Artifact)
      assert_receive {:review_changed, ^review_id, _artifact_id}
    end

    test "a second comment reuses the artifact the first one minted" do
      %{review: review, path: path} = covered_file("line 1\n")

      for body <- ["first", "second"] do
        assert %{"error" => nil} =
                 run(
                   %{
                     "review_id" => review.id,
                     "path" => path,
                     "scope" => "artifact",
                     "critique_type" => "note",
                     "body" => body
                   },
                   &Comments.add/0
                 )
      end

      assert [%Artifact{}] = Repo.all(Artifact)
      assert Repo.aggregate(Comment, :count) == 2
    end

    test "an unnamed agent authors anonymously" do
      %{review: review, path: path} = covered_file("line 1\n")

      assert %{"comment_id" => id, "error" => nil} =
               run(
                 %{
                   "review_id" => review.id,
                   "path" => path,
                   "scope" => "artifact",
                   "critique_type" => "note",
                   "body" => "x"
                 },
                 &Comments.add/0
               )

      assert %Comment{author: :agent, author_name: "", author_icon: ""} = Repo.get!(Comment, id)
    end

    test "emits review_not_found for an unknown review" do
      assert %{"comment_id" => nil, "error" => "review_not_found"} =
               run(
                 %{
                   "review_id" => Ecto.UUID.generate(),
                   "path" => "a.md",
                   "scope" => "artifact",
                   "critique_type" => "note",
                   "body" => "x"
                 },
                 &Comments.add/0
               )
    end

    test "emits not_covered for a path outside the review's selection" do
      %{review: review} = covered_file("line 1\n")

      assert %{"comment_id" => nil, "error" => "not_covered"} =
               run(
                 %{
                   "review_id" => review.id,
                   "path" => "nowhere.md",
                   "scope" => "artifact",
                   "critique_type" => "note",
                   "body" => "x"
                 },
                 &Comments.add/0
               )
    end
  end

  describe "resolve/0 and unresolve/0" do
    test "an agent resolves a comment and reopens it" do
      round = source_round("line 1\n")
      comment = published_comment(round.id, %{scope: :review, critique_type: :note, body: "x"})

      assert %{"comment_id" => id, "error" => nil} =
               run(%{"comment_id" => comment.id}, &Comments.resolve/0)

      assert id == comment.id
      assert %Comment{resolved_round: 0} = Repo.get!(Comment, comment.id)

      assert %{"comment_id" => _id, "error" => nil} =
               run(%{"comment_id" => comment.id}, &Comments.unresolve/0)

      assert %Comment{resolved_round: nil} = Repo.get!(Comment, comment.id)
    end

    test "emits not_open when the comment is already resolved" do
      round = source_round("line 1\n")
      comment = published_comment(round.id, %{scope: :review, critique_type: :note, body: "x"})
      {:ok, _resolved} = Critique.resolve_comment(comment.id)

      assert %{"comment_id" => nil, "error" => "not_open"} =
               run(%{"comment_id" => comment.id}, &Comments.resolve/0)
    end
  end

  describe "reply/0" do
    test "posts an agent reply, broadcasts the review topic, and emits its id" do
      round = source_round("line 1\nline 2\n")
      %Artifact{review_id: review_id} = Reads.get_artifact(round.artifact_id)
      comment = published_comment(round.id, %{scope: :review, critique_type: :note, body: "x"})
      Events.subscribe(review_id)

      assert %{"reply_id" => id, "error" => nil} =
               run(%{"comment_id" => comment.id, "body" => "fixed"}, &Comments.reply/0)

      assert is_binary(id)
      assert_receive {:review_changed, ^review_id, _artifact_id}
    end

    test "emits comment_not_found for an unknown comment" do
      assert %{"reply_id" => nil, "error" => "comment_not_found"} =
               run(%{"comment_id" => Ecto.UUID.generate(), "body" => "x"}, &Comments.reply/0)
    end
  end

  # A review whose selection covers a real file on disk, with no artifact minted
  # yet — the state a reviewing agent finds before the human opens anything.
  defp covered_file(content) do
    project = insert(:project)
    path = "doc.md"
    File.mkdir_p!(project.path)
    File.write!(Path.join(project.path, path), content)
    review = insert(:review, project: project, source: %FileSelection{selection_paths: [path]})
    %{review: review, path: path}
  end

  defp run(payload, fun) do
    [input: Jason.encode!(payload)]
    |> capture_io(fun)
    |> Jason.decode!()
  end
end

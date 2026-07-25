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
  alias SuikouWeb.AgentCLI.Comments

  describe "add/0" do
    test "authors a published comment under the calling agent's name" do
      round = source_round(Enum.map_join(1..12, "\n", &"line #{&1}") <> "\n")
      %Artifact{review_id: review_id} = Reads.get_artifact(round.artifact_id)
      Events.subscribe(review_id)

      assert %{"comment_id" => id, "error" => nil} =
               run(
                 %{
                   "artifact_id" => round.artifact_id,
                   "scope" => "located",
                   "critique_type" => "fix_required",
                   "body" => "off by one",
                   "anchor" => %{"type" => "line_range", "start_line" => 10, "end_line" => 12},
                   "as" => "Codex",
                   "icon" => "🤖"
                 },
                 &Comments.add/0
               )

      assert %Comment{author: :agent, author_name: "Codex", author_icon: "🤖", status: :published} =
               Repo.get!(Comment, id)

      assert_receive {:review_changed, ^review_id, _artifact_id}
    end

    test "an unnamed agent authors anonymously" do
      round = source_round("line 1\n")

      assert %{"comment_id" => id, "error" => nil} =
               run(
                 %{
                   "artifact_id" => round.artifact_id,
                   "scope" => "artifact",
                   "critique_type" => "note",
                   "body" => "x"
                 },
                 &Comments.add/0
               )

      assert %Comment{author: :agent, author_name: "", author_icon: ""} = Repo.get!(Comment, id)
    end

    test "emits artifact_not_found for an unknown artifact" do
      assert %{"comment_id" => nil, "error" => "artifact_not_found"} =
               run(
                 %{
                   "artifact_id" => Ecto.UUID.generate(),
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

  defp run(payload, fun) do
    [input: Jason.encode!(payload)]
    |> capture_io(fun)
    |> Jason.decode!()
  end
end

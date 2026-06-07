defmodule Suikou.Reviews.CommentsTest do
  use Suikou.DataCase

  import Suikou.ReviewsFixtures

  alias Suikou.Reviews
  alias Suikou.Reviews.Schemas.Comment

  describe "authoring scope" do
    test "a line-scoped comment anchors to a range and captures the quoted source" do
      content = Enum.map_join(1..12, "\n", &"line #{&1}") <> "\n"
      %{round: round} = artifact_fixture(content: content)

      assert {:ok, comment} =
               Reviews.add_comment(%{
                 round_id: round.id,
                 scope: :line,
                 start_line: 10,
                 end_line: 12,
                 critique_type: :note,
                 body: "fix this"
               })

      assert comment.start_line == 10
      assert comment.end_line == 12
      assert comment.quote == "line 10\nline 11\nline 12"
    end

    test "a single-line comment stores equal start and end lines" do
      content = Enum.map_join(1..8, "\n", &"line #{&1}") <> "\n"
      %{round: round} = artifact_fixture(content: content)

      assert {:ok, comment} =
               Reviews.add_comment(%{
                 round_id: round.id,
                 scope: :line,
                 start_line: 7,
                 end_line: 7,
                 critique_type: :note,
                 body: "x"
               })

      assert comment.start_line == 7
      assert comment.end_line == 7
    end

    test "a review-scoped comment carries no line anchor" do
      %{round: round} = artifact_fixture()

      assert {:ok, comment} =
               Reviews.add_comment(%{
                 round_id: round.id,
                 scope: :review,
                 critique_type: :note,
                 body: "overall"
               })

      assert comment.scope == :review
      assert is_nil(comment.start_line)
      assert is_nil(comment.end_line)
    end
  end

  describe "authoring validation" do
    test "each critique type is stored verbatim" do
      %{round: round} = artifact_fixture()

      for type <- [:fix_required, :needs_answer, :note] do
        assert {:ok, comment} =
                 Reviews.add_comment(%{
                   round_id: round.id,
                   scope: :review,
                   critique_type: type,
                   body: "x"
                 })

        assert comment.critique_type == type
      end
    end

    test "an unrecognised critique type is rejected" do
      %{round: round} = artifact_fixture()

      assert {:error, %Ecto.Changeset{}} =
               Reviews.add_comment(%{
                 round_id: round.id,
                 scope: :review,
                 critique_type: :blocking,
                 body: "x"
               })
    end

    test "an empty body is rejected and no comment is stored" do
      %{round: round} = artifact_fixture()

      assert {:error, %Ecto.Changeset{}} =
               Reviews.add_comment(%{
                 round_id: round.id,
                 scope: :review,
                 critique_type: :note,
                 body: "   "
               })

      assert Repo.aggregate(Comment, :count) == 0
    end
  end

  describe "latest-round attachment" do
    test "a new comment attaches to the current round" do
      %{artifact: artifact} = artifact_fixture()
      %{round: round2} = advance(artifact.id, "changed\n")

      assert {:ok, comment} =
               Reviews.add_comment(%{
                 round_id: round2.id,
                 scope: :review,
                 critique_type: :note,
                 body: "x"
               })

      assert comment.round_id == round2.id
    end

    test "commenting on a superseded round is rejected" do
      %{artifact: artifact, round: round1} = artifact_fixture()
      advance(artifact.id, "changed\n")

      assert {:error, :not_latest_round} =
               Reviews.add_comment(%{
                 round_id: round1.id,
                 scope: :review,
                 critique_type: :note,
                 body: "x"
               })
    end
  end

  describe "pending lifecycle" do
    test "a pending comment body can be edited" do
      %{round: round} = artifact_fixture()
      comment = pending_comment(round.id, %{body: "old"})

      assert {:ok, edited} =
               Reviews.edit_comment(comment.id, %{body: "new", critique_type: :note})

      assert edited.body == "new"
    end

    test "a pending comment type can be changed" do
      %{round: round} = artifact_fixture()
      comment = pending_comment(round.id, %{critique_type: :note})

      assert {:ok, edited} =
               Reviews.edit_comment(comment.id, %{body: "b", critique_type: :fix_required})

      assert edited.critique_type == :fix_required
    end

    test "a pending comment can be deleted" do
      %{round: round} = artifact_fixture()
      comment = pending_comment(round.id)

      assert {:ok, _deleted} = Reviews.delete_comment(comment.id)
      assert is_nil(Repo.get(Comment, comment.id))
    end
  end

  describe "published immutability" do
    test "editing a published comment is rejected" do
      %{round: round} = artifact_fixture()
      comment = published_comment(round.id)

      assert {:error, :published_immutable} =
               Reviews.edit_comment(comment.id, %{body: "x", critique_type: :note})
    end

    test "deleting a published comment is rejected and it still exists" do
      %{round: round} = artifact_fixture()
      comment = published_comment(round.id)

      assert {:error, :published_immutable} = Reviews.delete_comment(comment.id)
      assert Repo.get(Comment, comment.id)
    end
  end

  describe "resolution" do
    test "resolving a published comment records the current round" do
      %{artifact: artifact, round: round} = artifact_fixture()
      comment = published_comment(round.id)
      advance(artifact.id, "changed\n")

      assert {:ok, resolved} = Reviews.resolve_comment(comment.id)
      assert resolved.resolved_round == 2
    end

    test "resolving a pending comment is rejected" do
      %{round: round} = artifact_fixture()
      comment = pending_comment(round.id)

      assert {:error, :not_published} = Reviews.resolve_comment(comment.id)
    end
  end

  describe "missing targets" do
    test "adding a comment to a non-existent round is rejected" do
      assert {:error, :round_not_found} =
               Reviews.add_comment(%{
                 round_id: 999_999,
                 scope: :review,
                 critique_type: :note,
                 body: "x"
               })
    end

    test "editing a non-existent comment is rejected" do
      assert {:error, :comment_not_found} =
               Reviews.edit_comment(999_999, %{body: "x", critique_type: :note})
    end

    test "deleting a non-existent comment is rejected" do
      assert {:error, :comment_not_found} = Reviews.delete_comment(999_999)
    end

    test "resolving a non-existent comment is rejected" do
      assert {:error, :comment_not_found} = Reviews.resolve_comment(999_999)
    end
  end
end

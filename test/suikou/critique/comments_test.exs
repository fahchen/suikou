defmodule Suikou.Critique.CommentsTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Schemas.Anchor.LineRange
  alias Suikou.Schemas.Comment

  describe "authoring scope" do
    test "a located comment anchors to a range and captures the quoted source" do
      round = source_round(Enum.map_join(1..12, "\n", &"line #{&1}") <> "\n")

      assert {:ok, comment} =
               Critique.add_comment(%{
                 round_id: round.id,
                 scope: :located,
                 anchor: %{type: "line_range", start_line: 10, end_line: 12},
                 critique_type: :note,
                 body: "fix this"
               })

      assert %{
               anchor: %LineRange{
                 start_line: 10,
                 end_line: 12,
                 quote: "line 10\nline 11\nline 12"
               }
             } =
               comment
    end

    test "a located comment records its authoring round" do
      round = source_round(Enum.map_join(1..12, "\n", &"line #{&1}") <> "\n")

      assert {:ok, comment} =
               Critique.add_comment(%{
                 round_id: round.id,
                 scope: :located,
                 anchor: %{type: "line_range", start_line: 10, end_line: 12},
                 critique_type: :note,
                 body: "fix this"
               })

      assert %{authored_round: 0} = comment
    end

    test "a single-line comment stores equal start and end lines" do
      round = source_round(Enum.map_join(1..8, "\n", &"line #{&1}") <> "\n")

      assert {:ok, comment} =
               Critique.add_comment(%{
                 round_id: round.id,
                 scope: :located,
                 anchor: %{type: "line_range", start_line: 7, end_line: 7},
                 critique_type: :note,
                 body: "x"
               })

      assert %{anchor: %LineRange{start_line: 7, end_line: 7}} = comment
    end

    test "a located comment with an unknown anchor type is rejected" do
      round = source_round("line 1\nline 2\n")

      assert {:error, :unknown_anchor_type} =
               Critique.add_comment(%{
                 round_id: round.id,
                 scope: :located,
                 anchor: %{type: "diff_hunk", start_line: 1, end_line: 1},
                 critique_type: :note,
                 body: "x"
               })
    end

    test "a review-scoped comment carries no line anchor" do
      round = insert(:round)

      assert {:ok, comment} =
               Critique.add_comment(%{
                 round_id: round.id,
                 scope: :review,
                 critique_type: :note,
                 body: "overall"
               })

      assert %{scope: :review, anchor: nil} = comment
    end
  end

  describe "authoring validation" do
    test "each critique type is stored verbatim" do
      round = insert(:round)

      for type <- [:fix_required, :needs_answer, :note] do
        assert {:ok, comment} =
                 Critique.add_comment(%{
                   round_id: round.id,
                   scope: :review,
                   critique_type: type,
                   body: "x"
                 })

        assert %{critique_type: ^type} = comment
      end
    end

    test "an unrecognised critique type is rejected" do
      round = insert(:round)

      assert {:error, %Ecto.Changeset{}} =
               Critique.add_comment(%{
                 round_id: round.id,
                 scope: :review,
                 critique_type: :blocking,
                 body: "x"
               })
    end

    test "an empty body is rejected and no comment is stored" do
      round = insert(:round)

      assert {:error, %Ecto.Changeset{}} =
               Critique.add_comment(%{
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
      artifact = insert(:round).artifact
      %{round: round2} = advance(artifact.id, "changed\n")

      assert {:ok, comment} =
               Critique.add_comment(%{
                 round_id: round2.id,
                 scope: :review,
                 critique_type: :note,
                 body: "x"
               })

      round2_id = round2.id
      assert %{round_id: ^round2_id} = comment
    end

    test "commenting on a superseded round is rejected" do
      round1 = insert(:round)
      artifact = round1.artifact
      advance(artifact.id, "changed\n")

      assert {:error, :not_latest_round} =
               Critique.add_comment(%{
                 round_id: round1.id,
                 scope: :review,
                 critique_type: :note,
                 body: "x"
               })
    end
  end

  describe "pending lifecycle" do
    test "a pending comment body can be edited" do
      round = insert(:round)
      comment = pending_comment(round.id, %{body: "old"})

      assert {:ok, edited} =
               Critique.edit_comment(comment.id, %{body: "new", critique_type: :note})

      assert %{body: "new"} = edited
    end

    test "a pending comment type can be changed" do
      round = insert(:round)
      comment = pending_comment(round.id, %{critique_type: :note})

      assert {:ok, edited} =
               Critique.edit_comment(comment.id, %{body: "b", critique_type: :fix_required})

      assert %{critique_type: :fix_required} = edited
    end

    test "a pending comment can be deleted" do
      round = insert(:round)
      comment = pending_comment(round.id)

      assert {:ok, _deleted} = Critique.delete_comment(comment.id)
      assert is_nil(Repo.get(Comment, comment.id))
    end
  end

  describe "published comment lifecycle after submission" do
    test "editing a published comment is rejected" do
      round = insert(:round)
      comment = published_comment(round.id, %{body: "old"})

      assert {:error, :not_pending} =
               Critique.edit_comment(comment.id, %{body: "new", critique_type: :note})
    end

    test "a published comment can be deleted" do
      round = insert(:round)
      comment = published_comment(round.id)

      assert {:ok, _deleted} = Critique.delete_comment(comment.id)
      assert is_nil(Repo.get(Comment, comment.id))
    end
  end

  describe "resolution" do
    test "resolving a published comment records the current round" do
      round = insert(:round)
      artifact = round.artifact
      comment = published_comment(round.id)
      advance(artifact.id, "changed\n")

      assert {:ok, resolved} = Critique.resolve_comment(comment.id)
      assert %{resolved_round: 1} = resolved
    end

    test "resolving a pending comment is rejected" do
      round = insert(:round)
      comment = pending_comment(round.id)

      assert {:error, :not_open} = Critique.resolve_comment(comment.id)
    end

    test "resolving an already-resolved comment is rejected" do
      round = insert(:round)
      artifact = round.artifact
      comment = published_comment(round.id)
      advance(artifact.id, "changed\n")
      {:ok, _comment} = Critique.resolve_comment(comment.id)

      assert {:error, :not_open} = Critique.resolve_comment(comment.id)
    end
  end

  describe "missing targets" do
    test "adding a comment to a non-existent round is rejected" do
      assert {:error, :round_not_found} =
               Critique.add_comment(%{
                 round_id: "00000000-0000-7000-8000-000000000000",
                 scope: :review,
                 critique_type: :note,
                 body: "x"
               })
    end

    test "editing a non-existent comment is rejected" do
      assert {:error, :comment_not_found} =
               Critique.edit_comment("00000000-0000-7000-8000-000000000000", %{
                 body: "x",
                 critique_type: :note
               })
    end

    test "deleting a non-existent comment is rejected" do
      assert {:error, :comment_not_found} =
               Critique.delete_comment("00000000-0000-7000-8000-000000000000")
    end

    test "resolving a non-existent comment is rejected" do
      assert {:error, :comment_not_found} =
               Critique.resolve_comment("00000000-0000-7000-8000-000000000000")
    end
  end
end

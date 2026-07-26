defmodule Suikou.Critique.CommentsTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Reviews
  alias Suikou.Schemas.Anchor.LineRange
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply

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

  describe "authorship" do
    test "the human authoring path records the reviewer, not a default" do
      round = insert(:round)

      assert {:ok, %Comment{author: :human, author_name: "", author_icon: ""}} =
               Critique.add_comment(%{
                 round_id: round.id,
                 scope: :review,
                 critique_type: :note,
                 body: "x"
               })
    end

    test "a comment with no author is rejected rather than assumed human" do
      round = insert(:round)

      changeset =
        Comment.author_changeset(%Comment{}, %{
          round_id: round.id,
          scope: :review,
          critique_type: :note,
          body: "x",
          authored_round: 0
        })

      refute changeset.valid?
      assert %{author: ["can't be blank"]} = errors_on(changeset)
    end

    test "a reply with no author is rejected rather than assumed human" do
      changeset =
        Reply.changeset(%Reply{}, %{
          comment_id: Ecto.UUID.generate(),
          body: "x"
        })

      refute changeset.valid?
      assert %{author: ["can't be blank"]} = errors_on(changeset)
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

    test "unresolving a resolved comment reopens it" do
      round = insert(:round)
      artifact = round.artifact
      comment = published_comment(round.id)
      advance(artifact.id, "changed\n")
      {:ok, _comment} = Critique.resolve_comment(comment.id)

      assert {:ok, reopened} = Critique.reopen_comment(comment.id)
      assert %{resolved_round: nil} = reopened
    end

    test "unresolving an open comment is rejected" do
      round = insert(:round)
      comment = published_comment(round.id)

      assert {:error, :not_resolved} = Critique.reopen_comment(comment.id)
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

  describe "add_comment_as_agent/3" do
    test "opens the file and publishes on its round under the agent's name" do
      %{review: review, path: path} =
        covered_file(Enum.map_join(1..12, "\n", &"line #{&1}") <> "\n")

      assert {:ok, comment} =
               Critique.add_comment_as_agent(
                 review,
                 %{
                   path: path,
                   scope: :located,
                   anchor: %{type: "line_range", start_line: 10, end_line: 12},
                   critique_type: :fix_required,
                   body: "off by one"
                 },
                 agent("Codex", "🤖")
               )

      assert %Comment{
               author: :agent,
               author_name: "Codex",
               author_icon: "🤖",
               status: :published,
               authored_round: 0,
               anchor: %LineRange{start_line: 10, end_line: 12}
             } = comment
    end

    test "an agent writing without an icon still records its name" do
      %{review: review, path: path} = covered_file("line 1\n")

      assert {:ok, %Comment{author: :agent, author_name: "Codex", author_icon: ""}} =
               Critique.add_comment_as_agent(
                 review,
                 %{path: path, scope: :artifact, critique_type: :note, body: "x"},
                 agent("Codex")
               )
    end

    test "an agent must name itself, and may not claim the reviewer's name" do
      assert {:error, :agent_name_required} = Critique.agent_identity(nil, nil)
      assert {:error, :agent_name_required} = Critique.agent_identity("  ", "🤖")
      # Case-insensitive: the reviewer's name is theirs however it is spelled.
      assert {:error, :agent_name_reserved} = Critique.agent_identity("Human", "🤖")
      assert {:error, :agent_name_reserved} = Critique.agent_identity("human", nil)
    end

    test "the comment lands on the newest round, not the one the agent last saw" do
      %{review: review, path: path} = covered_file("line 1\n")
      {:ok, artifact} = Reviews.open_file(review, path)
      %{round: latest} = advance(artifact.id, "v1\n")

      assert {:ok, %Comment{round_id: round_id, authored_round: 1}} =
               Critique.add_comment_as_agent(
                 review,
                 %{path: path, scope: :artifact, critique_type: :note, body: "x"},
                 agent("Codex")
               )

      assert round_id == latest.id
    end

    test "a path the review does not cover is rejected" do
      %{review: review} = covered_file("line 1\n")

      assert {:error, :not_covered} =
               Critique.add_comment_as_agent(
                 review,
                 %{path: "nowhere.md", scope: :artifact, critique_type: :note, body: "x"},
                 agent("Codex")
               )
    end

    test "a rejected comment leaves no half-opened file behind" do
      %{review: review, path: path} = covered_file("line 1\n")

      assert {:error, %Ecto.Changeset{}} =
               Critique.add_comment_as_agent(
                 review,
                 %{path: path, scope: :artifact, critique_type: :note, body: "  "},
                 agent("Codex")
               )

      # The file was not opened before the call and must not be after it: the
      # mint and the insert share one transaction.
      assert Repo.aggregate(Artifact, :count) == 0
      assert Repo.aggregate(Comment, :count) == 0
    end

    test "an agent may resolve any comment, recording which one claimed it" do
      %{review: review, path: path} = covered_file("line 1\n")

      {:ok, comment} =
        Critique.add_comment_as_agent(
          review,
          %{path: path, scope: :artifact, critique_type: :fix_required, body: "x"},
          agent("Codex")
        )

      assert {:ok, %Comment{resolved_round: 0, resolved_by: :agent, resolved_by_name: "Claude"}} =
               Critique.resolve_comment_as_agent(comment.id, agent("Claude"))

      assert {:ok, %Comment{resolved_round: nil, resolved_by: nil, resolved_by_name: nil}} =
               Critique.reopen_comment(comment.id)
    end

    test "the human's own resolve is recorded as theirs" do
      round = insert(:round)
      comment = published_comment(round.id)

      assert {:ok, %Comment{resolved_by: :human, resolved_by_name: ""}} =
               Critique.resolve_comment(comment.id)
    end
  end

  defp agent(name, icon \\ nil) do
    {:ok, identity} = Critique.agent_identity(name, icon)
    identity
  end
end

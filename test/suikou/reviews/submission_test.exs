defmodule Suikou.Reviews.SubmissionTest do
  use Suikou.DataCase

  import Suikou.ReviewsFixtures

  alias Suikou.Reviews
  alias Suikou.Reviews.Schemas.Comment

  describe "first submission" do
    test "creates a review at round 1 and mints an artifact id" do
      assert {:ok, %{artifact: artifact, round: round, bumped: true}} =
               Reviews.submit(%{title: "Auth rollout plan", content: "hello\nworld\n"})

      assert is_integer(artifact.id)
      assert round.number == 1
      assert round.content == "hello\nworld\n"
    end

    test "empty content is rejected and no review is created" do
      assert {:error, :empty_content} =
               Reviews.submit(%{title: "Plan", content: "   \n"})
    end

    test "blank title is rejected" do
      assert {:error, %Ecto.Changeset{}} =
               Reviews.submit(%{title: "  ", content: "body"})
    end

    test "malformed markdown is still accepted verbatim" do
      content = "# unclosed [link]( and ```no close"
      assert {:ok, %{round: round}} = Reviews.submit(%{title: "x", content: content})
      assert round.content == content
    end

    test "an unknown artifact id is treated as a new artifact" do
      assert {:ok, %{artifact: artifact, round: round}} =
               Reviews.submit(%{artifact_id: 999_999, title: "x", content: "body"})

      assert artifact.id != 999_999
      assert round.number == 1
    end
  end

  describe "resubmission" do
    test "changed content advances the round" do
      %{artifact: artifact} = artifact_fixture()

      assert {:ok, %{round: round, bumped: true}} =
               Reviews.submit(%{artifact_id: artifact.id, content: "new content\n"})

      assert round.number == 2
      assert round.content == "new content\n"
    end

    test "byte-identical content does not advance the round" do
      %{artifact: artifact, round: round} = artifact_fixture(content: "same\n")

      assert {:ok, %{round: ^round, bumped: false}} =
               Reviews.submit(%{artifact_id: artifact.id, content: "same\n"})
    end
  end

  describe "carry-forward" do
    test "an unresolved published comment carries onto the new round as a linked row" do
      %{artifact: artifact, round: round} = artifact_fixture()
      origin = published_comment(round.id, %{scope: :review})

      %{round: round2} = advance(artifact.id, "changed\n")

      carried = Repo.get_by(Comment, round_id: round2.id, origin_id: origin.id)
      assert carried
      assert carried.status == :published
      assert carried.id != origin.id

      assert Repo.get!(Comment, origin.id).round_id == round.id
    end

    test "a resolved comment does not carry forward" do
      %{artifact: artifact, round: round} = artifact_fixture()
      comment = published_comment(round.id)
      {:ok, _resolved} = Reviews.resolve_comment(comment.id)

      %{round: round2} = advance(artifact.id, "changed\n")

      on_round2 = from(c in Comment, where: c.round_id == ^round2.id)
      assert Repo.all(on_round2) == []
    end

    test "a pending comment does not carry forward and stays pending" do
      %{artifact: artifact, round: round} = artifact_fixture()
      comment = pending_comment(round.id)

      %{round: round2} = advance(artifact.id, "changed\n")

      on_round2 = from(c in Comment, where: c.round_id == ^round2.id)
      assert Repo.all(on_round2) == []
      assert Repo.get!(Comment, comment.id).status == :pending
    end

    test "a pending comment stays editable after the artifact advances" do
      %{artifact: artifact, round: round} = artifact_fixture()
      comment = pending_comment(round.id, %{body: "old"})

      advance(artifact.id, "changed\n")

      assert {:ok, edited} =
               Reviews.edit_comment(comment.id, %{body: "new", critique_type: :note})

      assert edited.body == "new"
    end

    test "a line-scoped comment re-anchors by exact quote when the line still exists" do
      r1 = "intro\nrate limit is 100 rps\noutro\n"
      %{artifact: artifact, round: round} = artifact_fixture(content: r1)

      published_comment(round.id, %{
        scope: :line,
        start_line: 2,
        end_line: 2,
        critique_type: :fix_required
      })

      r2 = "added\nmore\nintro\nrate limit is 100 rps\noutro\n"
      %{round: round2} = advance(artifact.id, r2)

      on_round2 = from(c in Comment, where: c.round_id == ^round2.id)
      carried = Repo.one(on_round2)
      assert carried.start_line == 4
      assert carried.end_line == 4
      refute carried.outdated
    end

    test "a line-scoped comment is marked outdated when the quote is gone" do
      r1 = "intro\nrate limit is 100 rps\noutro\n"
      %{artifact: artifact, round: round} = artifact_fixture(content: r1)

      published_comment(round.id, %{
        scope: :line,
        start_line: 2,
        end_line: 2,
        critique_type: :fix_required
      })

      %{round: round2} = advance(artifact.id, "totally\ndifferent\ntext\n")

      on_round2 = from(c in Comment, where: c.round_id == ^round2.id)
      carried = Repo.one(on_round2)
      assert carried.outdated
      assert is_nil(carried.start_line)
      assert is_nil(carried.end_line)
    end

    test "a carried comment's thread continues on the new round" do
      %{artifact: artifact, round: round} = artifact_fixture()
      published_comment(round.id, %{scope: :review})

      %{round: round2} = advance(artifact.id, "changed\n")
      on_round2 = from(c in Comment, where: c.round_id == ^round2.id)
      carried = Repo.one(on_round2)

      assert {:ok, human} = Reviews.reply_as_human(carried.id, "still open?")
      assert {:ok, agent} = Reviews.reply_as_agent(carried.id, "addressed")
      assert human.comment_id == carried.id
      assert agent.comment_id == carried.id
    end

    test "an open comment carries across multiple rounds, chaining origins each hop" do
      %{artifact: artifact, round: round} = artifact_fixture()
      origin = published_comment(round.id, %{scope: :review})

      %{round: round2} = advance(artifact.id, "v2\n")
      on_round2 = from(c in Comment, where: c.round_id == ^round2.id)
      carried2 = Repo.one(on_round2)
      assert carried2.origin_id == origin.id

      %{round: round3} = advance(artifact.id, "v3\n")
      on_round3 = from(c in Comment, where: c.round_id == ^round3.id)
      carried3 = Repo.one(on_round3)
      assert carried3.origin_id == carried2.id
      assert carried3.status == :published
    end
  end
end

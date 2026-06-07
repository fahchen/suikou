defmodule Suikou.Artifacts.SubmissionTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Artifacts
  alias Suikou.Critique
  alias Suikou.Schemas.Anchor.LineRange
  alias Suikou.Schemas.Comment

  describe "first submission" do
    test "creates a review at round 1 and mints an artifact id" do
      assert {:ok, %{artifact: artifact, round: round, bumped: true}} =
               Artifacts.submit(%{title: "Auth rollout plan", content: "hello\nworld\n"})

      assert {:ok, _uuid} = Ecto.UUID.cast(artifact.id)
      assert %{number: 1, content: "hello\nworld\n"} = round
    end

    test "empty content is rejected and no review is created" do
      assert {:error, :empty_content} =
               Artifacts.submit(%{title: "Plan", content: "   \n"})
    end

    test "blank title is rejected" do
      assert {:error, %Ecto.Changeset{}} =
               Artifacts.submit(%{title: "  ", content: "body"})
    end

    test "malformed markdown is still accepted verbatim" do
      content = "# unclosed [link]( and ```no close"
      assert {:ok, %{round: round}} = Artifacts.submit(%{title: "x", content: content})
      assert %{content: ^content} = round
    end

    test "an unknown artifact id is treated as a new artifact" do
      assert {:ok, %{artifact: artifact, round: round}} =
               Artifacts.submit(%{
                 artifact_id: "00000000-0000-7000-8000-000000000000",
                 title: "x",
                 content: "body"
               })

      assert artifact.id != "00000000-0000-7000-8000-000000000000"
      assert %{number: 1} = round
    end
  end

  describe "resubmission" do
    test "changed content advances the round" do
      artifact = insert(:round).artifact

      assert {:ok, %{round: round, bumped: true}} =
               Artifacts.submit(%{artifact_id: artifact.id, content: "new content\n"})

      assert %{number: 2, content: "new content\n"} = round
    end

    test "byte-identical content does not advance the round" do
      round = insert(:round, content: "same\n")
      round_id = round.id

      assert {:ok, %{round: %{id: ^round_id}, bumped: false}} =
               Artifacts.submit(%{artifact_id: round.artifact.id, content: "same\n"})
    end
  end

  describe "carry-forward" do
    test "an unresolved published comment carries onto the new round as a linked row" do
      round = insert(:round)
      artifact = round.artifact
      origin = published_comment(round.id, %{scope: :review})

      %{round: round2} = advance(artifact.id, "changed\n")

      carried = Repo.get_by(Comment, round_id: round2.id, origin_id: origin.id)
      assert %{status: :published} = carried
      assert carried.id != origin.id

      round_id = round.id
      assert %{round_id: ^round_id} = Repo.get!(Comment, origin.id)
    end

    test "a resolved comment does not carry forward" do
      round = insert(:round)
      artifact = round.artifact
      comment = published_comment(round.id)
      {:ok, _resolved} = Critique.resolve_comment(comment.id)

      %{round: round2} = advance(artifact.id, "changed\n")

      on_round2 = from(c in Comment, where: c.round_id == ^round2.id)
      assert Repo.all(on_round2) == []
    end

    test "a pending comment does not carry forward and stays pending" do
      round = insert(:round)
      artifact = round.artifact
      comment = pending_comment(round.id)

      %{round: round2} = advance(artifact.id, "changed\n")

      on_round2 = from(c in Comment, where: c.round_id == ^round2.id)
      assert Repo.all(on_round2) == []
      assert %{status: :pending} = Repo.get!(Comment, comment.id)
    end

    test "a pending comment stays editable after the artifact advances" do
      round = insert(:round)
      artifact = round.artifact
      comment = pending_comment(round.id, %{body: "old"})

      advance(artifact.id, "changed\n")

      assert {:ok, edited} =
               Critique.edit_comment(comment.id, %{body: "new", critique_type: :note})

      assert %{body: "new"} = edited
    end

    test "a line-scoped comment re-anchors by diff mapping when the line still exists" do
      r1 = "intro\nrate limit is 100 rps\noutro\n"
      round = insert(:round, content: r1)
      artifact = round.artifact

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

      assert %{
               outdated: false,
               anchor: %LineRange{start_line: 4, end_line: 4, quote: "rate limit is 100 rps"}
             } = carried
    end

    test "a line-scoped comment is marked outdated when its line is gone, keeping its stale anchor" do
      r1 = "intro\nrate limit is 100 rps\noutro\n"
      round = insert(:round, content: r1)
      artifact = round.artifact

      published_comment(round.id, %{
        scope: :line,
        start_line: 2,
        end_line: 2,
        critique_type: :fix_required
      })

      %{round: round2} = advance(artifact.id, "totally\ndifferent\ntext\n")

      on_round2 = from(c in Comment, where: c.round_id == ^round2.id)
      carried = Repo.one(on_round2)

      assert %{outdated: true, anchor: %LineRange{start_line: 2, end_line: 2}} = carried
    end

    test "a carried comment's thread continues on the new round" do
      round = insert(:round)
      artifact = round.artifact
      published_comment(round.id, %{scope: :review})

      %{round: round2} = advance(artifact.id, "changed\n")
      on_round2 = from(c in Comment, where: c.round_id == ^round2.id)
      carried = Repo.one(on_round2)

      carried_id = carried.id

      assert {:ok, %{comment_id: ^carried_id}} =
               Critique.reply_as_human(carried.id, "still open?")

      assert {:ok, %{comment_id: ^carried_id}} = Critique.reply_as_agent(carried.id, "addressed")
    end

    test "an open comment carries across multiple rounds, chaining origins each hop" do
      round = insert(:round)
      artifact = round.artifact
      origin = published_comment(round.id, %{scope: :review})

      %{round: round2} = advance(artifact.id, "v2\n")
      on_round2 = from(c in Comment, where: c.round_id == ^round2.id)
      origin_id = origin.id
      carried2 = Repo.one(on_round2)
      assert %{origin_id: ^origin_id} = carried2

      %{round: round3} = advance(artifact.id, "v3\n")
      on_round3 = from(c in Comment, where: c.round_id == ^round3.id)
      carried2_id = carried2.id
      carried3 = Repo.one(on_round3)
      assert %{origin_id: ^carried2_id, status: :published} = carried3
    end
  end
end

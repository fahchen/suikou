defmodule Suikou.SubmissionsTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Round
  alias Suikou.Schemas.Submission
  alias Suikou.Submissions

  describe "submission target" do
    test "a submission is recorded on the latest round" do
      artifact = insert(:round).artifact
      %{round: round2} = advance(artifact.id, "changed\n")

      round2_id = round2.id

      assert {:ok, %{submission: %{round_id: ^round2_id}}} =
               Submissions.submit(round2.id, :comment)
    end

    test "submitting on a superseded round is rejected" do
      round1 = insert(:round)
      artifact = round1.artifact
      advance(artifact.id, "changed\n")

      assert {:error, :not_latest_round} = Submissions.submit(round1.id, :comment)
    end

    test "an unrecognised verdict is rejected" do
      round = insert(:round)
      assert {:error, %Ecto.Changeset{}} = Submissions.submit(round.id, :merge)
    end
  end

  describe "publishing" do
    test "submitting publishes every pending comment on the round" do
      round = insert(:round)
      a = pending_comment(round.id)
      b = pending_comment(round.id)

      assert {:ok, _submission} = Submissions.submit(round.id, :comment)
      assert %{status: :published} = Repo.get!(Comment, a.id)
      assert %{status: :published} = Repo.get!(Comment, b.id)
    end

    test "submitting publishes pending comments across every file in the review" do
      review = insert(:review)
      round1 = round_in_review(review)
      round2 = round_in_review(review)
      a = pending_comment(round1.id)
      b = pending_comment(round2.id)

      assert {:ok, _submission} = Submissions.submit(round1.id, :comment)
      assert %{status: :published} = Repo.get!(Comment, a.id)
      assert %{status: :published} = Repo.get!(Comment, b.id)
    end

    test "submitting one file does not advance another file's round" do
      review = insert(:review)
      round1 = round_in_review(review)
      round2 = round_in_review(review)
      pending_comment(round2.id)

      assert {:ok, _submission} = Submissions.submit(round1.id, :comment)

      round2_artifact_id = round2.artifact_id
      assert [%{id: round2_id}] = Repo.all(where(Round, artifact_id: ^round2_artifact_id))
      assert round2_id == round2.id
    end

    test "submitting does not publish pending comments in a different review" do
      round = insert(:round)
      other = insert(:round)
      stranger = pending_comment(other.id)

      assert {:ok, _submission} = Submissions.submit(round.id, :comment)
      assert %{status: :pending} = Repo.get!(Comment, stranger.id)
    end

    test "each submission records its verdict" do
      for verdict <- [:approve, :request_changes, :comment] do
        round = insert(:round)
        assert {:ok, %{submission: %{verdict: ^verdict}}} = Submissions.submit(round.id, verdict)
      end
    end
  end

  describe "approval" do
    test "an approve verdict records the approved round" do
      artifact = insert(:round).artifact
      %{round: round2} = advance(artifact.id, "changed\n")

      assert {:ok, _submission} = Submissions.submit(round2.id, :approve)
      assert %{approved_round: 1} = Repo.get!(Artifact, artifact.id)
    end

    test "request_changes does not approve" do
      round = insert(:round)
      artifact = round.artifact
      assert {:ok, _submission} = Submissions.submit(round.id, :request_changes)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end

    test "comment verdict does not approve" do
      round = insert(:round)
      artifact = round.artifact
      assert {:ok, _submission} = Submissions.submit(round.id, :comment)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end
  end

  describe "soft gate" do
    test "approving with an open fix_required comment warns but approves" do
      round = insert(:round)
      artifact = round.artifact
      pending_comment(round.id, %{critique_type: :fix_required})

      assert {:ok, %{warnings: warnings}} = Submissions.submit(round.id, :approve)
      assert :unresolved_fix_required in warnings
      round_number = round.number
      assert %{approved_round: ^round_number} = Repo.get!(Artifact, artifact.id)
    end

    test "request_changes with an open fix_required keeps the artifact under review" do
      round = insert(:round)
      artifact = round.artifact
      pending_comment(round.id, %{critique_type: :fix_required})

      assert {:ok, _submission} = Submissions.submit(round.id, :request_changes)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end
  end

  describe "no terminal reject state" do
    test "request_changes is not terminal: a later approve still accepts the artifact" do
      round = insert(:round)
      artifact = round.artifact
      {:ok, %{next_round: next}} = Submissions.submit(round.id, :request_changes)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)

      {:ok, _approve} = Submissions.submit(next.id, :approve)
      next_number = next.number
      assert %{approved_round: ^next_number} = Repo.get!(Artifact, artifact.id)
    end
  end

  describe "dismiss and supersession" do
    test "dismissing an approval reopens the review" do
      round = insert(:round)
      artifact = round.artifact
      {:ok, _submission} = Submissions.submit(round.id, :approve)

      assert {:ok, _artifact} = Submissions.dismiss(artifact.id)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end

    test "a non-approve submit after approval clears the standing approval" do
      artifact = insert(:round).artifact
      %{round: round2} = advance(artifact.id, "v2\n")
      {:ok, %{next_round: round3}} = Submissions.submit(round2.id, :approve)
      assert %{approved_round: 1} = Repo.get!(Artifact, artifact.id)

      {:ok, _submission} = Submissions.submit(round3.id, :request_changes)
      assert %{number: 2} = round3
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end

    test "latest_verdict returns the most recent submission's verdict" do
      round = insert(:round)
      {:ok, _first} = Submissions.submit(round.id, :request_changes)
      # second submission on the same round (still latest) supersedes the verdict view
      {:ok, _second} =
        Repo.insert(Submission.changeset(%{round_id: round.id, verdict: :comment}))

      assert :comment = Submissions.latest_verdict(round.id)
    end
  end

  describe "draft verdict" do
    test "storing a draft verdict persists it on the round" do
      round = insert(:round)

      assert {:ok, %{draft_verdict: :approve}} = Submissions.set_draft_verdict(round.id, :approve)
      assert %{draft_verdict: :approve} = Repo.get!(Round, round.id)
    end

    test "a later draft verdict overwrites the earlier one" do
      round = insert(:round)
      {:ok, _round} = Submissions.set_draft_verdict(round.id, :approve)

      assert {:ok, %{draft_verdict: :request_changes}} =
               Submissions.set_draft_verdict(round.id, :request_changes)
    end

    test "storing a draft verdict on a non-existent round is rejected" do
      assert {:error, :round_not_found} =
               Submissions.set_draft_verdict("00000000-0000-7000-8000-000000000000", :approve)
    end
  end

  describe "missing targets" do
    test "submitting on a non-existent round is rejected" do
      assert {:error, :round_not_found} =
               Submissions.submit("00000000-0000-7000-8000-000000000000", :comment)
    end

    test "dismissing a non-existent artifact is rejected" do
      assert {:error, :artifact_not_found} =
               Submissions.dismiss("00000000-0000-7000-8000-000000000000")
    end

    test "latest_verdict is nil when no submission exists on the round" do
      round = insert(:round)
      assert is_nil(Submissions.latest_verdict(round.id))
    end
  end
end

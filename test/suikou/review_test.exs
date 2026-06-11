defmodule Suikou.ReviewTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Review
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Round

  describe "submission target" do
    test "a review is submitted on the latest round" do
      artifact = insert(:round).artifact
      %{round: round2} = advance(artifact.id, "changed\n")

      round2_id = round2.id

      assert {:ok, %{review: %{round_id: ^round2_id}}} =
               Review.submit_review(round2.id, :comment)
    end

    test "submitting a review on a superseded round is rejected" do
      round1 = insert(:round)
      artifact = round1.artifact
      advance(artifact.id, "changed\n")

      assert {:error, :not_latest_round} = Review.submit_review(round1.id, :comment)
    end

    test "an unrecognised verdict is rejected" do
      round = insert(:round)
      assert {:error, %Ecto.Changeset{}} = Review.submit_review(round.id, :merge)
    end
  end

  describe "publishing" do
    test "submitting a review publishes every pending comment on the round" do
      round = insert(:round)
      a = pending_comment(round.id)
      b = pending_comment(round.id)

      assert {:ok, _review} = Review.submit_review(round.id, :comment)
      assert %{status: :published} = Repo.get!(Comment, a.id)
      assert %{status: :published} = Repo.get!(Comment, b.id)
    end

    test "each review records its verdict" do
      for verdict <- [:approve, :request_changes, :comment] do
        round = insert(:round)
        assert {:ok, %{review: %{verdict: ^verdict}}} = Review.submit_review(round.id, verdict)
      end
    end
  end

  describe "approval" do
    test "an approve verdict records the approved round" do
      artifact = insert(:round).artifact
      %{round: round2} = advance(artifact.id, "changed\n")

      assert {:ok, _review} = Review.submit_review(round2.id, :approve)
      assert %{approved_round: 1} = Repo.get!(Artifact, artifact.id)
    end

    test "request_changes does not approve" do
      round = insert(:round)
      artifact = round.artifact
      assert {:ok, _review} = Review.submit_review(round.id, :request_changes)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end

    test "comment verdict does not approve" do
      round = insert(:round)
      artifact = round.artifact
      assert {:ok, _review} = Review.submit_review(round.id, :comment)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end
  end

  describe "soft gate" do
    test "approving with an open fix_required comment warns but approves" do
      round = insert(:round)
      artifact = round.artifact
      pending_comment(round.id, %{critique_type: :fix_required})

      assert {:ok, %{warnings: warnings}} = Review.submit_review(round.id, :approve)
      assert :unresolved_fix_required in warnings
      round_number = round.number
      assert %{approved_round: ^round_number} = Repo.get!(Artifact, artifact.id)
    end

    test "request_changes with an open fix_required keeps the artifact under review" do
      round = insert(:round)
      artifact = round.artifact
      pending_comment(round.id, %{critique_type: :fix_required})

      assert {:ok, _review} = Review.submit_review(round.id, :request_changes)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end
  end

  describe "no terminal reject state" do
    test "request_changes is not terminal: a later approve still accepts the artifact" do
      round = insert(:round)
      artifact = round.artifact
      {:ok, %{next_round: next}} = Review.submit_review(round.id, :request_changes)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)

      {:ok, _approve} = Review.submit_review(next.id, :approve)
      next_number = next.number
      assert %{approved_round: ^next_number} = Repo.get!(Artifact, artifact.id)
    end
  end

  describe "dismiss and supersession" do
    test "dismissing an approval reopens the review" do
      round = insert(:round)
      artifact = round.artifact
      {:ok, _review} = Review.submit_review(round.id, :approve)

      assert {:ok, _artifact} = Review.dismiss(artifact.id)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end

    test "a non-approve submit after approval clears the standing approval" do
      artifact = insert(:round).artifact
      %{round: round2} = advance(artifact.id, "v2\n")
      {:ok, %{next_round: round3}} = Review.submit_review(round2.id, :approve)
      assert %{approved_round: 1} = Repo.get!(Artifact, artifact.id)

      {:ok, _review} = Review.submit_review(round3.id, :request_changes)
      assert %{number: 2} = round3
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end

    test "latest_verdict returns the most recent review's verdict" do
      round = insert(:round)
      {:ok, _first} = Review.submit_review(round.id, :request_changes)
      # second review on the same round (still latest) supersedes the verdict view
      {:ok, _second} =
        Repo.insert(Suikou.Schemas.Review.changeset(%{round_id: round.id, verdict: :comment}))

      assert :comment = Review.latest_verdict(round.id)
    end
  end

  describe "draft verdict" do
    test "storing a draft verdict persists it on the round" do
      round = insert(:round)

      assert {:ok, %{draft_verdict: :approve}} = Review.set_draft_verdict(round.id, :approve)
      assert %{draft_verdict: :approve} = Repo.get!(Round, round.id)
    end

    test "a later draft verdict overwrites the earlier one" do
      round = insert(:round)
      {:ok, _} = Review.set_draft_verdict(round.id, :approve)

      assert {:ok, %{draft_verdict: :request_changes}} =
               Review.set_draft_verdict(round.id, :request_changes)
    end

    test "storing a draft verdict on a non-existent round is rejected" do
      assert {:error, :round_not_found} =
               Review.set_draft_verdict("00000000-0000-7000-8000-000000000000", :approve)
    end
  end

  describe "missing targets" do
    test "submitting a review on a non-existent round is rejected" do
      assert {:error, :round_not_found} =
               Review.submit_review("00000000-0000-7000-8000-000000000000", :comment)
    end

    test "dismissing a non-existent artifact is rejected" do
      assert {:error, :artifact_not_found} =
               Review.dismiss("00000000-0000-7000-8000-000000000000")
    end

    test "latest_verdict is nil when no review exists on the round" do
      round = insert(:round)
      assert is_nil(Review.latest_verdict(round.id))
    end
  end
end

defmodule Suikou.Reviews.VerdictsTest do
  use Suikou.DataCase

  import Suikou.ReviewsFixtures

  alias Suikou.Reviews
  alias Suikou.Reviews.Schemas.Artifact
  alias Suikou.Reviews.Schemas.Comment
  alias Suikou.Reviews.Schemas.Review

  describe "submission target" do
    test "a review is submitted on the latest round" do
      %{artifact: artifact} = artifact_fixture()
      %{round: round2} = advance(artifact.id, "changed\n")

      round2_id = round2.id

      assert {:ok, %{review: %{round_id: ^round2_id}}} =
               Reviews.submit_review(round2.id, :comment)
    end

    test "submitting a review on a superseded round is rejected" do
      %{artifact: artifact, round: round1} = artifact_fixture()
      advance(artifact.id, "changed\n")

      assert {:error, :not_latest_round} = Reviews.submit_review(round1.id, :comment)
    end

    test "an unrecognised verdict is rejected" do
      %{round: round} = artifact_fixture()
      assert {:error, %Ecto.Changeset{}} = Reviews.submit_review(round.id, :merge)
    end
  end

  describe "publishing" do
    test "submitting a review publishes every pending comment on the round" do
      %{round: round} = artifact_fixture()
      a = pending_comment(round.id)
      b = pending_comment(round.id)

      assert {:ok, _review} = Reviews.submit_review(round.id, :comment)
      assert %{status: :published} = Repo.get!(Comment, a.id)
      assert %{status: :published} = Repo.get!(Comment, b.id)
    end

    test "each review records its verdict" do
      for verdict <- [:approve, :request_changes, :comment] do
        %{round: round} = artifact_fixture()
        assert {:ok, %{review: %{verdict: ^verdict}}} = Reviews.submit_review(round.id, verdict)
      end
    end
  end

  describe "approval" do
    test "an approve verdict records the approved round" do
      %{artifact: artifact} = artifact_fixture()
      %{round: round2} = advance(artifact.id, "changed\n")

      assert {:ok, _review} = Reviews.submit_review(round2.id, :approve)
      assert %{approved_round: 2} = Repo.get!(Artifact, artifact.id)
    end

    test "request_changes does not approve" do
      %{round: round, artifact: artifact} = artifact_fixture()
      assert {:ok, _review} = Reviews.submit_review(round.id, :request_changes)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end

    test "comment verdict does not approve" do
      %{round: round, artifact: artifact} = artifact_fixture()
      assert {:ok, _review} = Reviews.submit_review(round.id, :comment)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end
  end

  describe "soft gate" do
    test "approving with an open fix_required comment warns but approves" do
      %{artifact: artifact, round: round} = artifact_fixture()
      pending_comment(round.id, %{critique_type: :fix_required})

      assert {:ok, %{warnings: warnings}} = Reviews.submit_review(round.id, :approve)
      assert :unresolved_fix_required in warnings
      round_number = round.number
      assert %{approved_round: ^round_number} = Repo.get!(Artifact, artifact.id)
    end

    test "request_changes with an open fix_required keeps the artifact under review" do
      %{artifact: artifact, round: round} = artifact_fixture()
      pending_comment(round.id, %{critique_type: :fix_required})

      assert {:ok, _review} = Reviews.submit_review(round.id, :request_changes)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end
  end

  describe "no terminal reject state" do
    test "request_changes is not terminal: a later approve still accepts the artifact" do
      %{artifact: artifact, round: round} = artifact_fixture()
      {:ok, _rc} = Reviews.submit_review(round.id, :request_changes)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)

      {:ok, _approve} = Reviews.submit_review(round.id, :approve)
      round_number = round.number
      assert %{approved_round: ^round_number} = Repo.get!(Artifact, artifact.id)
    end
  end

  describe "dismiss and supersession" do
    test "dismissing an approval reopens the review" do
      %{artifact: artifact, round: round} = artifact_fixture()
      {:ok, _review} = Reviews.submit_review(round.id, :approve)

      assert {:ok, _artifact} = Reviews.dismiss(artifact.id)
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end

    test "resubmitting changed content after approval clears approval and bumps the round" do
      %{artifact: artifact} = artifact_fixture()
      %{round: round2} = advance(artifact.id, "v2\n")
      {:ok, _review} = Reviews.submit_review(round2.id, :approve)
      assert %{approved_round: 2} = Repo.get!(Artifact, artifact.id)

      %{round: round3} = advance(artifact.id, "v3\n")
      assert %{number: 3} = round3
      assert %{approved_round: nil} = Repo.get!(Artifact, artifact.id)
    end

    test "latest_verdict returns the most recent review's verdict" do
      %{round: round} = artifact_fixture()
      {:ok, _first} = Reviews.submit_review(round.id, :request_changes)
      # second review on the same round (still latest) supersedes the verdict view
      {:ok, _second} = Repo.insert(Review.changeset(%{round_id: round.id, verdict: :comment}))

      assert :comment = Suikou.Reviews.Verdicts.latest_verdict(round.id)
    end
  end

  describe "missing targets" do
    test "submitting a review on a non-existent round is rejected" do
      assert {:error, :round_not_found} =
               Reviews.submit_review("00000000-0000-7000-8000-000000000000", :comment)
    end

    test "dismissing a non-existent artifact is rejected" do
      assert {:error, :artifact_not_found} =
               Reviews.dismiss("00000000-0000-7000-8000-000000000000")
    end

    test "latest_verdict is nil when no review exists on the round" do
      %{round: round} = artifact_fixture()
      assert is_nil(Suikou.Reviews.Verdicts.latest_verdict(round.id))
    end
  end
end

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

      assert {:ok, %{review: review}} = Reviews.submit_review(round2.id, :comment)
      assert review.round_id == round2.id
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
      assert Repo.get!(Comment, a.id).status == :published
      assert Repo.get!(Comment, b.id).status == :published
    end

    test "each review records its verdict" do
      for verdict <- [:approve, :request_changes, :comment] do
        %{round: round} = artifact_fixture()
        assert {:ok, %{review: review}} = Reviews.submit_review(round.id, verdict)
        assert review.verdict == verdict
      end
    end
  end

  describe "approval" do
    test "an approve verdict records the approved round" do
      %{artifact: artifact} = artifact_fixture()
      %{round: round2} = advance(artifact.id, "changed\n")

      assert {:ok, _review} = Reviews.submit_review(round2.id, :approve)
      assert Repo.get!(Artifact, artifact.id).approved_round == 2
    end

    test "request_changes does not approve" do
      %{round: round, artifact: artifact} = artifact_fixture()
      assert {:ok, _review} = Reviews.submit_review(round.id, :request_changes)
      assert is_nil(Repo.get!(Artifact, artifact.id).approved_round)
    end

    test "comment verdict does not approve" do
      %{round: round, artifact: artifact} = artifact_fixture()
      assert {:ok, _review} = Reviews.submit_review(round.id, :comment)
      assert is_nil(Repo.get!(Artifact, artifact.id).approved_round)
    end
  end

  describe "soft gate" do
    test "approving with an open fix_required comment warns but approves" do
      %{artifact: artifact, round: round} = artifact_fixture()
      pending_comment(round.id, %{critique_type: :fix_required})

      assert {:ok, %{warnings: warnings}} = Reviews.submit_review(round.id, :approve)
      assert :unresolved_fix_required in warnings
      assert Repo.get!(Artifact, artifact.id).approved_round == round.number
    end

    test "request_changes with an open fix_required keeps the artifact under review" do
      %{artifact: artifact, round: round} = artifact_fixture()
      pending_comment(round.id, %{critique_type: :fix_required})

      assert {:ok, _review} = Reviews.submit_review(round.id, :request_changes)
      assert is_nil(Repo.get!(Artifact, artifact.id).approved_round)
    end
  end

  describe "no terminal reject state" do
    test "request_changes is not terminal: a later approve still accepts the artifact" do
      %{artifact: artifact, round: round} = artifact_fixture()
      {:ok, _rc} = Reviews.submit_review(round.id, :request_changes)
      assert is_nil(Repo.get!(Artifact, artifact.id).approved_round)

      {:ok, _approve} = Reviews.submit_review(round.id, :approve)
      assert Repo.get!(Artifact, artifact.id).approved_round == round.number
    end
  end

  describe "dismiss and supersession" do
    test "dismissing an approval reopens the review" do
      %{artifact: artifact, round: round} = artifact_fixture()
      {:ok, _review} = Reviews.submit_review(round.id, :approve)

      assert {:ok, _artifact} = Reviews.dismiss(artifact.id)
      assert is_nil(Repo.get!(Artifact, artifact.id).approved_round)
    end

    test "resubmitting changed content after approval clears approval and bumps the round" do
      %{artifact: artifact} = artifact_fixture()
      %{round: round2} = advance(artifact.id, "v2\n")
      {:ok, _review} = Reviews.submit_review(round2.id, :approve)
      assert Repo.get!(Artifact, artifact.id).approved_round == 2

      %{round: round3} = advance(artifact.id, "v3\n")
      assert round3.number == 3
      assert is_nil(Repo.get!(Artifact, artifact.id).approved_round)
    end

    test "latest_verdict returns the most recent review's verdict" do
      %{round: round} = artifact_fixture()
      {:ok, _first} = Reviews.submit_review(round.id, :request_changes)
      # second review on the same round (still latest) supersedes the verdict view
      {:ok, _second} = Repo.insert(Review.changeset(%{round_id: round.id, verdict: :comment}))

      assert Suikou.Reviews.Verdicts.latest_verdict(round.id) == :comment
    end
  end

  describe "missing targets" do
    test "submitting a review on a non-existent round is rejected" do
      assert {:error, :round_not_found} = Reviews.submit_review(999_999, :comment)
    end

    test "dismissing a non-existent artifact is rejected" do
      assert {:error, :artifact_not_found} = Reviews.dismiss(999_999)
    end

    test "latest_verdict is nil when no review exists on the round" do
      %{round: round} = artifact_fixture()
      assert is_nil(Suikou.Reviews.Verdicts.latest_verdict(round.id))
    end
  end
end

defmodule Suikou.SubmissionsTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Round
  alias Suikou.Submissions

  describe "submission target" do
    test "a submission is recorded on the latest round" do
      artifact = insert(:round).artifact
      %{round: round2} = advance(artifact.id, "changed\n")

      round2_id = round2.id

      assert {:ok, %{submission: %{round_id: ^round2_id}}} = Submissions.submit(round2.id)
    end

    test "submitting on a superseded round is rejected" do
      round1 = insert(:round)
      artifact = round1.artifact
      advance(artifact.id, "changed\n")

      assert {:error, :not_latest_round} = Submissions.submit(round1.id)
    end
  end

  describe "publishing" do
    test "submitting publishes every pending comment on the round" do
      round = insert(:round)
      a = pending_comment(round.id)
      b = pending_comment(round.id)

      assert {:ok, _submission} = Submissions.submit(round.id)
      assert %{status: :published} = Repo.get!(Comment, a.id)
      assert %{status: :published} = Repo.get!(Comment, b.id)
    end

    test "submitting publishes pending comments across every file in the review" do
      review = insert(:review)
      round1 = round_in_review(review)
      round2 = round_in_review(review)
      a = pending_comment(round1.id)
      b = pending_comment(round2.id)

      assert {:ok, _submission} = Submissions.submit(round1.id)
      assert %{status: :published} = Repo.get!(Comment, a.id)
      assert %{status: :published} = Repo.get!(Comment, b.id)
    end

    test "submitting one file does not advance another file's round" do
      review = insert(:review)
      round1 = round_in_review(review)
      round2 = round_in_review(review)
      pending_comment(round2.id)

      assert {:ok, _submission} = Submissions.submit(round1.id)

      round2_artifact_id = round2.artifact_id
      assert [%{id: round2_id}] = Repo.all(where(Round, artifact_id: ^round2_artifact_id))
      assert round2_id == round2.id
    end

    test "submitting does not publish pending comments in a different review" do
      round = insert(:round)
      other = insert(:round)
      stranger = pending_comment(other.id)

      assert {:ok, _submission} = Submissions.submit(round.id)
      assert %{status: :pending} = Repo.get!(Comment, stranger.id)
    end
  end

  describe "round advance" do
    test "submitting opens the next draft round" do
      round = insert(:round)
      number = round.number

      assert {:ok, %{next_round: next}} = Submissions.submit(round.id)
      assert next.number == number + 1
      assert next.content_hash == round.content_hash
    end
  end

  describe "review_submission_count/1" do
    test "is zero for a review with no submissions" do
      review = insert(:review)
      round_in_review(review)

      assert Submissions.review_submission_count(review.id) == 0
    end

    test "increments monotonically with each submit across the review's files" do
      review = insert(:review)
      round1 = round_in_review(review)
      round2 = round_in_review(review)

      assert {:ok, _submission} = Submissions.submit(round1.id)
      assert Submissions.review_submission_count(review.id) == 1

      assert {:ok, _submission} = Submissions.submit(round2.id)
      assert Submissions.review_submission_count(review.id) == 2
    end

    test "counts only submissions belonging to the review" do
      review = insert(:review)
      round = round_in_review(review)
      other = insert(:round)

      assert {:ok, _submission} = Submissions.submit(round.id)
      assert {:ok, _other} = Submissions.submit(other.id)

      assert Submissions.review_submission_count(review.id) == 1
    end
  end

  describe "unpublished?/1" do
    test "is false for a review with nothing pending" do
      review = insert(:review)
      round_in_review(review)

      refute Submissions.unpublished?(review.id)
    end

    test "is true while a pending comment is unpublished" do
      review = insert(:review)
      round = round_in_review(review)
      pending_comment(round.id)

      assert Submissions.unpublished?(review.id)
    end

    test "is false again once the review is submitted" do
      review = insert(:review)
      round = round_in_review(review)
      pending_comment(round.id)
      {:ok, _submission} = Submissions.submit(round.id)

      refute Submissions.unpublished?(review.id)
    end
  end

  describe "missing targets" do
    test "submitting on a non-existent round is rejected" do
      assert {:error, :round_not_found} =
               Submissions.submit("00000000-0000-7000-8000-000000000000")
    end
  end
end

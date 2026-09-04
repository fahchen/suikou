defmodule Suikou.Submissions do
  @moduledoc """
  Round submission. Submitting is what advances a round (see BDR-0018): it
  publishes every pending comment and reply across the round's review (all
  files, not just the submitted file), records the submission, and opens the
  next draft round by copying the snapshot forward. Comments are single rows
  that stay visible across rounds until resolved, so no critique is copied
  forward. The round advance stays per-artifact — only the submitted round
  records a submission and opens a next round.
  """

  import Ecto.Query

  alias Suikou.Events
  alias Suikou.Reads
  alias Suikou.Repo
  alias Suikou.ReviewScope
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Round
  alias Suikou.Schemas.Submission

  @type submit_result :: %{submission: Submission.t(), next_round: Round.t()}

  @doc """
  Submits the latest round, advancing the artifact. Publishes every pending
  comment and reply across the round's review (all files) and opens the next
  draft round, copying content forward.

  ## Examples

      Suikou.Submissions.submit(round.id)
      #=> {:ok, %{submission: %Suikou.Schemas.Submission{}, next_round: %Suikou.Schemas.Round{}}}

      Suikou.Submissions.submit("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> {:error, :round_not_found}

  """
  @spec submit(Ecto.UUID.t()) ::
          {:ok, submit_result()}
          | {:error, Ecto.Changeset.t() | :round_not_found | :not_latest_round}
  def submit(round_id) do
    round = Rounds.get(round_id)
    changeset = Submission.changeset(%{round_id: round_id})

    cond do
      is_nil(round) ->
        {:error, :round_not_found}

      not Rounds.latest?(round) ->
        {:error, :not_latest_round}

      not changeset.valid? ->
        {:error, changeset}

      true ->
        round |> apply_submission_transaction(changeset) |> broadcast_review_change(round_id)
    end
  end

  defp apply_submission_transaction(round, changeset) do
    Repo.transaction(fn -> apply_submission(round, changeset) end)
  end

  @doc """
  Counts every submission recorded across a review's artifacts. Because each
  submit inserts exactly one `Submission` and never deletes one, the count is
  monotonic per review — the poll cursor that tells an agent a new round has
  been submitted.

  ## Examples

      Suikou.Submissions.review_submission_count(review.id)
      #=> 3

      Suikou.Submissions.review_submission_count("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> 0

  """
  @spec review_submission_count(Ecto.UUID.t()) :: non_neg_integer()
  def review_submission_count(review_id) do
    from(s in Submission, as: :submission)
    |> join(:inner, [submission: s], rd in Round, as: :round, on: s.round_id == rd.id)
    |> join(:inner, [round: rd], a in Artifact, as: :artifact, on: rd.artifact_id == a.id)
    |> where([artifact: a], a.review_id == ^review_id)
    |> Repo.aggregate(:count)
  end

  @doc """
  Returns whether `review_id` has any unpublished work — a pending comment or
  reply anywhere in the review. Drives the review-level Submit affordance, which
  stays disabled until there is something to publish.

  ## Examples

      Suikou.Submissions.unpublished?(review.id)
      #=> true

      Suikou.Submissions.unpublished?(untouched_review.id)
      #=> false

  """
  @spec unpublished?(Ecto.UUID.t()) :: boolean()
  def unpublished?(review_id) do
    scope = {:review, review_id}
    pending_comment?(scope) or pending_reply?(scope)
  end

  defp pending_comment?(scope), do: scope |> pending_comments_query() |> Repo.exists?()

  defp pending_reply?(scope), do: scope |> pending_replies_query() |> Repo.exists?()

  defp pending_comments_query(scope),
    do: scope |> ReviewScope.comments() |> where([comment: c], c.status == :pending)

  defp pending_replies_query(scope),
    do: scope |> ReviewScope.replies() |> where([reply: rep], rep.status == :pending)

  defp broadcast_review_change({:ok, _submission} = result, round_id) do
    {review_id, artifact_id} = Reads.scope_for_round(round_id)
    Events.review_changed(review_id, artifact_id)
    result
  end

  defp broadcast_review_change(result, _round_id), do: result

  defp apply_submission(round, changeset) do
    submission = Repo.insert!(changeset)
    review_id = review_id_for(round)
    publish_pending_comments(review_id)
    publish_pending_replies(review_id)

    %{submission: submission, next_round: open_next_round(round)}
  end

  defp review_id_for(round) do
    Artifact
    |> where([a], a.id == ^round.artifact_id)
    |> select([a], a.review_id)
    |> Repo.one!()
  end

  defp publish_pending_comments(review_id) do
    {:review, review_id}
    |> pending_comments_query()
    |> Repo.update_all(set: [status: :published])
  end

  defp publish_pending_replies(review_id) do
    {:review, review_id}
    |> pending_replies_query()
    |> Repo.update_all(set: [status: :published])
  end

  defp open_next_round(round) do
    %{
      artifact_id: round.artifact_id,
      number: round.number + 1,
      content_hash: round.content_hash
    }
    |> Round.changeset()
    |> Repo.insert!()
  end
end

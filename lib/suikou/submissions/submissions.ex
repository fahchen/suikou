defmodule Suikou.Submissions do
  @moduledoc """
  Round submission and approval. Submitting is what advances a round (see
  BDR-0018): it publishes every pending comment and reply across the round's
  review (all files, not just the submitted file), records one verdict, and opens
  the next draft round by copying the snapshot forward. Comments are single rows
  that stay visible across rounds until resolved, so no critique is copied
  forward. Verdict and round advance stay per-artifact — only the submitted round
  records a verdict and opens a next round. An `approve` verdict records the
  approved round; any other verdict clears a standing approval. Approval is a
  soft gate — it is allowed with open `fix_required` comments but returns a
  warning (see BDR-0012), and is reversible via `dismiss/1`.
  """

  import Ecto.Query

  alias Suikou.Events
  alias Suikou.Reads
  alias Suikou.Repo
  alias Suikou.ReviewScope
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Round
  alias Suikou.Schemas.Submission

  @type submit_result :: %{
          submission: Submission.t(),
          next_round: Round.t(),
          warnings: [:unresolved_fix_required]
        }

  @doc """
  Submits the latest round, advancing the artifact. Publishes every pending
  comment and reply across the round's review (all files), records the verdict,
  opens the next draft round (copying content forward), and sets or clears
  approval. An `approve` verdict warns (without blocking) when open
  `fix_required` critique remains.

  ## Examples

      Suikou.Submissions.submit(round.id, :approve)
      #=> {:ok, %{submission: %Suikou.Schemas.Submission{verdict: :approve}, next_round: %Suikou.Schemas.Round{}, warnings: []}}

      Suikou.Submissions.submit("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", :approve)
      #=> {:error, :round_not_found}

  """
  @spec submit(Ecto.UUID.t(), Submission.verdict() | String.t()) ::
          {:ok, submit_result()}
          | {:error, Ecto.Changeset.t() | :round_not_found | :not_latest_round}
  def submit(round_id, verdict) do
    round = Rounds.get(round_id)
    changeset = Submission.changeset(%{round_id: round_id, verdict: verdict})

    cond do
      is_nil(round) -> {:error, :round_not_found}
      not Rounds.latest?(round) -> {:error, :not_latest_round}
      not changeset.valid? -> {:error, changeset}
      true -> round |> apply_submission_transaction(changeset) |> broadcast_review_change(round_id)
    end
  end

  defp apply_submission_transaction(round, changeset) do
    Repo.transaction(fn -> apply_submission(round, changeset) end)
  end

  @doc """
  Stores the reviewer's in-progress verdict on a draft round before submission,
  persisting the choice so it survives a reload. Cleared when the round is
  submitted.

  ## Examples

      Suikou.Submissions.set_draft_verdict(round.id, :approve)
      #=> {:ok, %Suikou.Schemas.Round{draft_verdict: :approve}}

      Suikou.Submissions.set_draft_verdict("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", :approve)
      #=> {:error, :round_not_found}

  """
  @spec set_draft_verdict(Ecto.UUID.t(), Submission.verdict() | String.t()) ::
          {:ok, Round.t()} | {:error, :round_not_found}
  def set_draft_verdict(round_id, verdict) do
    case Rounds.get(round_id) do
      nil ->
        {:error, :round_not_found}

      round ->
        round
        |> Round.draft_verdict_changeset(verdict)
        |> Repo.update()
        |> broadcast_review_change(round_id)
    end
  end

  @doc """
  Returns the most recent verdict recorded on a round, or `nil` when none.

  ## Examples

      Suikou.Submissions.latest_verdict(round.id)
      #=> :approve

      Suikou.Submissions.latest_verdict(unsubmitted_round.id)
      #=> nil

  """
  @spec latest_verdict(Ecto.UUID.t()) :: Submission.verdict() | nil
  def latest_verdict(round_id) do
    from(s in Submission, as: :submission)
    |> where([submission: s], s.round_id == ^round_id)
    |> order_by([submission: s], desc: s.id)
    |> limit(1)
    |> select([submission: s], s.verdict)
    |> Repo.one()
  end

  @doc """
  Returns the most recent verdict across all of an artifact's rounds, or `nil`
  when no submission exists. Because submitting always opens a fresh draft round,
  the artifact's standing verdict lives on the latest submitted round, never on
  the current draft.

  ## Examples

      Suikou.Submissions.latest_verdict_for_artifact(artifact.id)
      #=> :request_changes

      Suikou.Submissions.latest_verdict_for_artifact(unsubmitted_artifact.id)
      #=> nil

  """
  @spec latest_verdict_for_artifact(Ecto.UUID.t()) :: Submission.verdict() | nil
  def latest_verdict_for_artifact(artifact_id) do
    from(s in Submission, as: :submission)
    |> join(:inner, [submission: s], rd in Round, as: :round, on: s.round_id == rd.id)
    |> where([round: rd], rd.artifact_id == ^artifact_id)
    |> order_by([round: rd, submission: s], desc: rd.number, desc: s.id)
    |> limit(1)
    |> select([submission: s], s.verdict)
    |> Repo.one()
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
  Returns the in-progress `draft_verdict` on an artifact's latest round, or
  `nil` when no round exists yet or the draft is empty. A draft is the
  reviewer's pre-submission choice; it disappears the moment the round is
  submitted and a fresh draft round opens.

  ## Examples

      Suikou.Submissions.draft_verdict_for_artifact(artifact.id)
      #=> :request_changes

      Suikou.Submissions.draft_verdict_for_artifact(untouched_artifact.id)
      #=> nil

  """
  @spec draft_verdict_for_artifact(Ecto.UUID.t()) :: Submission.verdict() | nil
  def draft_verdict_for_artifact(artifact_id) do
    from(r in Round, as: :round)
    |> where([round: r], r.artifact_id == ^artifact_id)
    |> order_by([round: r], desc: r.number)
    |> limit(1)
    |> select([round: r], r.draft_verdict)
    |> Repo.one()
  end

  @doc """
  Returns whether `review_id` has any unpublished work — a draft verdict on any
  of its rounds, or a pending comment or reply anywhere in the review. Drives
  the review-level Submit affordance, which stays disabled until there is
  something to publish.

  ## Examples

      Suikou.Submissions.unpublished?(review.id)
      #=> true

      Suikou.Submissions.unpublished?(untouched_review.id)
      #=> false

  """
  @spec unpublished?(Ecto.UUID.t()) :: boolean()
  def unpublished?(review_id) do
    scope = {:review, review_id}
    draft_verdict?(review_id) or pending_comment?(scope) or pending_reply?(scope)
  end

  @doc """
  Returns whether `artifact_id` carries any pending (not-yet-published) comment
  or reply on its rounds. Lets the review-level submit treat a file that only
  has comments as an implicit `comment` verdict, publishing its critique.

  ## Examples

      Suikou.Submissions.comments_pending?(artifact.id)
      #=> true

  """
  @spec comments_pending?(Ecto.UUID.t()) :: boolean()
  def comments_pending?(artifact_id) do
    scope = {:artifact, artifact_id}
    pending_comment?(scope) or pending_reply?(scope)
  end

  defp draft_verdict?(review_id) do
    # A draft verdict only counts on an artifact's latest (unsubmitted) round.
    # Submitting inserts a submission and opens a fresh draft round, so a round
    # carrying a draft_verdict with no submission of its own is the live draft;
    # a submitted round keeps its historical draft_verdict but is excluded here.
    review_id
    |> ReviewScope.rounds()
    |> where([round: r], not is_nil(r.draft_verdict))
    |> where([round: r], not exists(submitted_round_subquery()))
    |> Repo.exists?()
  end

  defp submitted_round_subquery do
    from(s in Submission, where: s.round_id == parent_as(:round).id)
  end

  defp pending_comment?(scope), do: scope |> pending_comments_query() |> Repo.exists?()

  defp pending_reply?(scope), do: scope |> pending_replies_query() |> Repo.exists?()

  defp pending_comments_query(scope),
    do: scope |> ReviewScope.comments() |> where([comment: c], c.status == :pending)

  defp pending_replies_query(scope),
    do: scope |> ReviewScope.replies() |> where([reply: rep], rep.status == :pending)

  @doc """
  Reverses approval by clearing an artifact's approved round.

  ## Examples

      Suikou.Submissions.dismiss(artifact.id)
      #=> {:ok, %Suikou.Schemas.Artifact{approved_round: nil}}

      Suikou.Submissions.dismiss("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> {:error, :artifact_not_found}

  """
  @spec dismiss(Ecto.UUID.t()) :: {:ok, Artifact.t()} | {:error, :artifact_not_found}
  def dismiss(artifact_id) do
    case Repo.get(Artifact, artifact_id) do
      nil ->
        {:error, :artifact_not_found}

      %Artifact{} = artifact ->
        artifact |> Artifact.clear_approval_changeset() |> Repo.update()
    end
  end

  defp broadcast_review_change({:ok, _} = result, round_id) do
    round_id |> Reads.review_id_for_round() |> Events.review_changed()
    result
  end

  defp broadcast_review_change(result, _round_id), do: result

  defp apply_submission(round, changeset) do
    submission = Repo.insert!(changeset)
    review_id = review_id_for(round)
    publish_pending_comments(review_id)
    publish_pending_replies(review_id)
    update_approval(round, submission.verdict)
    next_round = open_next_round(round)

    %{
      submission: submission,
      next_round: next_round,
      warnings: warnings(round, submission.verdict)
    }
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

  defp update_approval(round, :approve), do: record_approval(round)
  defp update_approval(round, _verdict), do: clear_approval(round)

  defp record_approval(round) do
    Artifact
    |> Repo.get!(round.artifact_id)
    |> Artifact.approve_changeset(round.number)
    |> Repo.update!()
  end

  defp clear_approval(round) do
    Artifact
    |> Repo.get!(round.artifact_id)
    |> Artifact.clear_approval_changeset()
    |> Repo.update!()
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

  defp warnings(round, :approve) do
    if open_fix_required?(round), do: [:unresolved_fix_required], else: []
  end

  defp warnings(_round, _verdict), do: []

  defp open_fix_required?(round) do
    from(c in Comment, as: :comment)
    |> where(
      [comment: c],
      c.round_id == ^round.id and c.status == :published and
        c.critique_type == :fix_required and is_nil(c.resolved_round)
    )
    |> Repo.exists?()
  end
end

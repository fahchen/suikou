defmodule Suikou.Review do
  @moduledoc """
  Review submission and approval. Submitting is what advances a round (see
  BDR-0018): it publishes the submitted round's pending comments, records one
  verdict, and opens the next draft round by copying the snapshot forward and
  carrying unresolved published critique. An `approve` verdict records the
  approved round; any other verdict clears a standing approval. Approval is a
  soft gate — it is allowed with open `fix_required` comments but returns a
  warning (see BDR-0012), and is reversible via `dismiss/1`.
  """

  import Ecto.Query

  alias Suikou.Critique
  alias Suikou.Repo
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.Round

  @type submit_result :: %{
          review: Review.t(),
          next_round: Round.t(),
          warnings: [:unresolved_fix_required]
        }

  @doc """
  Submits a review of the latest round, advancing the artifact. Publishes the
  round's pending comments, records the verdict, opens the next draft round
  (copying content forward and carrying unresolved published critique), and
  sets or clears approval. An `approve` verdict warns (without blocking) when
  open `fix_required` critique remains.

  ## Examples

      Suikou.Review.submit_review(round.id, :approve)
      #=> {:ok, %{review: %Suikou.Schemas.Review{verdict: :approve}, next_round: %Suikou.Schemas.Round{}, warnings: []}}

      Suikou.Review.submit_review("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", :approve)
      #=> {:error, :round_not_found}

  """
  @spec submit_review(Ecto.UUID.t(), Review.verdict() | String.t()) ::
          {:ok, submit_result()}
          | {:error, Ecto.Changeset.t() | :round_not_found | :not_latest_round}
  def submit_review(round_id, verdict) do
    round = Rounds.get(round_id)
    changeset = Review.changeset(%{round_id: round_id, verdict: verdict})

    cond do
      is_nil(round) -> {:error, :round_not_found}
      not Rounds.latest?(round) -> {:error, :not_latest_round}
      not changeset.valid? -> {:error, changeset}
      true -> Repo.transaction(fn -> apply_review(round, changeset) end)
    end
  end

  @doc """
  Stores the reviewer's in-progress verdict on a draft round before submission,
  persisting the choice so it survives a reload. Cleared when the round is
  submitted.

  ## Examples

      Suikou.Review.set_draft_verdict(round.id, :approve)
      #=> {:ok, %Suikou.Schemas.Round{draft_verdict: :approve}}

      Suikou.Review.set_draft_verdict("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", :approve)
      #=> {:error, :round_not_found}

  """
  @spec set_draft_verdict(Ecto.UUID.t(), Review.verdict() | String.t()) ::
          {:ok, Round.t()} | {:error, :round_not_found}
  def set_draft_verdict(round_id, verdict) do
    case Rounds.get(round_id) do
      nil -> {:error, :round_not_found}
      round -> round |> Round.draft_verdict_changeset(verdict) |> Repo.update()
    end
  end

  @doc """
  Returns the most recent verdict recorded on a round, or `nil` when none.

  ## Examples

      Suikou.Review.latest_verdict(round.id)
      #=> :approve

      Suikou.Review.latest_verdict(round_without_review.id)
      #=> nil

  """
  @spec latest_verdict(Ecto.UUID.t()) :: Review.verdict() | nil
  def latest_verdict(round_id) do
    from(r in Review, as: :review)
    |> where([review: r], r.round_id == ^round_id)
    |> order_by([review: r], desc: r.id)
    |> limit(1)
    |> select([review: r], r.verdict)
    |> Repo.one()
  end

  @doc """
  Returns the most recent verdict across all of an artifact's rounds, or `nil`
  when no review exists. Because submitting always opens a fresh draft round,
  the artifact's standing verdict lives on the latest submitted round, never on
  the current draft.

  ## Examples

      Suikou.Review.latest_verdict_for_artifact(artifact.id)
      #=> :request_changes

      Suikou.Review.latest_verdict_for_artifact(unreviewed_artifact.id)
      #=> nil

  """
  @spec latest_verdict_for_artifact(Ecto.UUID.t()) :: Review.verdict() | nil
  def latest_verdict_for_artifact(artifact_id) do
    from(r in Review, as: :review)
    |> join(:inner, [review: r], rd in Round, as: :round, on: r.round_id == rd.id)
    |> where([round: rd], rd.artifact_id == ^artifact_id)
    |> order_by([round: rd, review: r], desc: rd.number, desc: r.id)
    |> limit(1)
    |> select([review: r], r.verdict)
    |> Repo.one()
  end

  @doc """
  Reverses approval by clearing an artifact's approved round.

  ## Examples

      Suikou.Review.dismiss(artifact.id)
      #=> {:ok, %Suikou.Schemas.Artifact{approved_round: nil}}

      Suikou.Review.dismiss("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
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

  defp apply_review(round, changeset) do
    review = Repo.insert!(changeset)
    publish_pending(round)
    update_approval(round, review.verdict)
    next_round = open_next_round(round)
    %{review: review, next_round: next_round, warnings: warnings(round, review.verdict)}
  end

  defp publish_pending(round) do
    from(c in Comment, as: :comment)
    |> where([comment: c], c.round_id == ^round.id and c.status == :pending)
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
    next_round =
      %{
        artifact_id: round.artifact_id,
        number: round.number + 1,
        content: round.content,
        content_hash: round.content_hash
      }
      |> Round.changeset()
      |> Repo.insert!()

    Critique.carry_forward(round, next_round)
    next_round
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

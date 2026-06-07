defmodule Suikou.Reviews.Verdicts do
  @moduledoc """
  Review submission and approval. Submitting a review on the latest round
  publishes its pending comments and records one verdict; an `approve` verdict
  records the approved round. Approval is a soft gate — it is allowed with
  open `fix_required` comments but returns a warning (see BDR-0012). Approval
  is reversible via `dismiss/1` and cleared by an agent resubmission.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Reviews.Rounds
  alias Suikou.Reviews.Schemas.Artifact
  alias Suikou.Reviews.Schemas.Comment
  alias Suikou.Reviews.Schemas.Review

  @type submit_result :: %{review: Review.t(), warnings: [atom()]}

  @spec submit_review(integer(), atom() | String.t()) ::
          {:ok, submit_result()} | {:error, Ecto.Changeset.t() | atom()}
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

  @spec latest_verdict(integer()) :: atom() | nil
  def latest_verdict(round_id) do
    Review
    |> where([r], r.round_id == ^round_id)
    |> order_by([r], desc: r.id)
    |> limit(1)
    |> select([r], r.verdict)
    |> Repo.one()
  end

  @spec dismiss(integer()) :: {:ok, Artifact.t()} | {:error, atom()}
  def dismiss(artifact_id) do
    case Repo.get(Artifact, artifact_id) do
      nil ->
        {:error, :artifact_not_found}

      %Artifact{} = artifact ->
        artifact |> Ecto.Changeset.change(approved_round: nil) |> Repo.update()
    end
  end

  defp apply_review(round, changeset) do
    review = Repo.insert!(changeset)
    publish_pending(round)
    if review.verdict == :approve, do: record_approval(round)
    %{review: review, warnings: warnings(round, review.verdict)}
  end

  defp publish_pending(round) do
    Comment
    |> where([c], c.round_id == ^round.id and c.status == :pending)
    |> Repo.update_all(set: [status: :published])
  end

  defp record_approval(round) do
    Artifact
    |> Repo.get!(round.artifact_id)
    |> Ecto.Changeset.change(approved_round: round.number)
    |> Repo.update!()
  end

  defp warnings(round, :approve) do
    if open_fix_required?(round), do: [:unresolved_fix_required], else: []
  end

  defp warnings(_round, _verdict), do: []

  defp open_fix_required?(round) do
    Comment
    |> where(
      [c],
      c.round_id == ^round.id and c.status == :published and
        c.critique_type == :fix_required and is_nil(c.resolved_round)
    )
    |> Repo.exists?()
  end
end

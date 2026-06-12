defmodule Suikou.Critique.CarryForward do
  @moduledoc """
  Brings a round's unresolved published critique onto the next round when an
  artifact advances (see BDR-0009). Each carried comment is a new row linked to
  its origin (BDR-0011), copying the captured anchor verbatim. A line comment's
  position and outdated state are resolved live against the current file at
  render, so carry-forward does no re-anchoring of its own.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Round

  @doc """
  Carries `prev_round`'s unresolved published comments onto `new_round`. Runs
  inside the advancing transaction.

  ## Examples

      Suikou.Critique.CarryForward.carry(prev_round, new_round)
      #=> :ok

  """
  @spec carry(Round.t(), Round.t()) :: :ok
  def carry(prev_round, new_round) do
    from(c in Comment, as: :comment)
    |> where(
      [comment: c],
      c.round_id == ^prev_round.id and c.status == :published and is_nil(c.resolved_round)
    )
    |> Repo.all()
    |> Enum.each(&carry_one(&1, new_round))
  end

  defp carry_one(comment, new_round) do
    Repo.insert!(%Comment{
      round_id: new_round.id,
      origin_id: comment.id,
      scope: comment.scope,
      anchor: comment.anchor,
      original_anchor: comment.original_anchor,
      original_round: comment.original_round,
      critique_type: comment.critique_type,
      body: comment.body,
      status: :published
    })
  end
end

defmodule Suikou.Critique.CarryForward do
  @moduledoc """
  Brings a round's unresolved published critique onto the next round when an
  artifact advances (see BDR-0009). Each carried comment is a new row linked to
  its origin (BDR-0011); a line-scoped comment re-anchors by exact quote match
  (BDR-0010) and is flagged `outdated` when its quote no longer exists.
  """

  import Ecto.Query

  alias Suikou.Critique.Anchor
  alias Suikou.Repo
  alias Suikou.Schemas.Anchor.LineRange
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
    |> Enum.each(&carry_one(&1, prev_round, new_round))
  end

  defp carry_one(comment, prev_round, new_round) do
    {anchor, outdated} = relocate(comment, prev_round.content, new_round.content)

    Repo.insert!(%Comment{
      round_id: new_round.id,
      origin_id: comment.id,
      scope: comment.scope,
      anchor: anchor,
      original_anchor: comment.original_anchor,
      original_round: comment.original_round,
      critique_type: comment.critique_type,
      body: comment.body,
      status: :published,
      outdated: outdated
    })
  end

  # An already-outdated comment keeps its stale anchor and stays outdated; its
  # lines no longer correspond to the previous snapshot, so remapping is moot.
  defp relocate(%Comment{outdated: true} = comment, _prev_content, _new_content) do
    {comment.anchor, true}
  end

  defp relocate(%Comment{anchor: %LineRange{} = anchor}, prev_content, new_content) do
    case Anchor.reanchor(prev_content, new_content, anchor) do
      {:ok, new_anchor} -> {new_anchor, false}
      :outdated -> {anchor, true}
    end
  end

  defp relocate(_comment, _prev_content, _new_content), do: {nil, false}
end

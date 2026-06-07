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
    {start_line, end_line, outdated} = relocate(comment, new_round.content)

    Repo.insert!(%Comment{
      round_id: new_round.id,
      origin_id: comment.id,
      scope: comment.scope,
      start_line: start_line,
      end_line: end_line,
      quote: comment.quote,
      critique_type: comment.critique_type,
      body: comment.body,
      status: :published,
      outdated: outdated
    })
  end

  defp relocate(%Comment{scope: :line, quote: quote}, content) when is_binary(quote) do
    case Anchor.reanchor(content, quote) do
      {start_line, end_line} -> {start_line, end_line, false}
      nil -> {nil, nil, true}
    end
  end

  defp relocate(_comment, _content), do: {nil, nil, false}
end

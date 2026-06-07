defmodule Suikou.Reviews.Diff do
  @moduledoc """
  Round-to-round diff for the reviewer: the snapshot text difference, the
  critique state transitions (resolved on the old round, newly added and
  carried-forward on the new round), and the change in latest verdict.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Reviews.Rounds
  alias Suikou.Reviews.Schemas.Comment
  alias Suikou.Reviews.Verdicts

  @type t :: %{
          text: [{:eq | :ins | :del, String.t()}],
          resolved: [Comment.t()],
          added: [Comment.t()],
          carried_forward: [Comment.t()],
          verdict_from: atom() | nil,
          verdict_to: atom() | nil
        }

  @spec round_diff(integer(), integer(), integer()) :: {:ok, t()} | {:error, atom()}
  def round_diff(artifact_id, from_number, to_number) do
    from_round = Rounds.get_by_number(artifact_id, from_number)
    to_round = Rounds.get_by_number(artifact_id, to_number)

    cond do
      is_nil(from_round) -> {:error, :round_not_found}
      is_nil(to_round) -> {:error, :round_not_found}
      true -> {:ok, build(from_round, to_round, to_number)}
    end
  end

  defp build(from_round, to_round, to_number) do
    %{
      text: String.myers_difference(from_round.content, to_round.content),
      resolved: resolved_at(from_round.id, to_number),
      added: added_on(to_round.id),
      carried_forward: carried_onto(to_round.id),
      verdict_from: Verdicts.latest_verdict(from_round.id),
      verdict_to: Verdicts.latest_verdict(to_round.id)
    }
  end

  defp resolved_at(round_id, to_number) do
    Comment
    |> where([c], c.round_id == ^round_id and c.resolved_round == ^to_number)
    |> order_by([c], asc: c.id)
    |> Repo.all()
  end

  defp added_on(round_id) do
    Comment
    |> where([c], c.round_id == ^round_id and is_nil(c.origin_id))
    |> order_by([c], asc: c.id)
    |> Repo.all()
  end

  defp carried_onto(round_id) do
    Comment
    |> where([c], c.round_id == ^round_id and not is_nil(c.origin_id))
    |> order_by([c], asc: c.id)
    |> Repo.all()
  end
end

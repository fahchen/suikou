defmodule Suikou.Reviews.Rounds do
  @moduledoc """
  Round query helpers shared across the review context. A round is "latest"
  when its number equals the highest round number for its artifact; critique
  and reviews may only attach to the latest round.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Reviews.Schemas.Round

  @spec get(integer()) :: Round.t() | nil
  def get(round_id), do: Repo.get(Round, round_id)

  @spec get_by_number(integer(), integer()) :: Round.t() | nil
  def get_by_number(artifact_id, number) do
    Repo.get_by(Round, artifact_id: artifact_id, number: number)
  end

  @spec latest(integer()) :: Round.t() | nil
  def latest(artifact_id) do
    Round
    |> where([r], r.artifact_id == ^artifact_id)
    |> order_by([r], desc: r.number)
    |> limit(1)
    |> Repo.one()
  end

  @spec latest_number(integer()) :: integer() | nil
  def latest_number(artifact_id) do
    Round
    |> where([r], r.artifact_id == ^artifact_id)
    |> select([r], max(r.number))
    |> Repo.one()
  end

  @spec latest?(Round.t()) :: boolean()
  def latest?(%Round{artifact_id: artifact_id, number: number}) do
    number == latest_number(artifact_id)
  end
end

defmodule Suikou.Reviews.Rounds do
  @moduledoc """
  Round query helpers shared across the review context. A round is "latest"
  when its number equals the highest round number for its artifact; critique
  and reviews may only attach to the latest round.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Reviews.Schemas.Round

  @doc """
  Fetches a round by id, or `nil` when none exists.

  ## Examples

      iex> Suikou.Reviews.Rounds.get(round.id)
      %Suikou.Reviews.Schemas.Round{number: 1}

      iex> Suikou.Reviews.Rounds.get(999_999)
      nil

  """
  @spec get(integer()) :: Round.t() | nil
  def get(round_id), do: Repo.get(Round, round_id)

  @doc """
  Fetches a round by its artifact and round number, or `nil` when none exists.

  ## Examples

      iex> Suikou.Reviews.Rounds.get_by_number(artifact.id, 2)
      %Suikou.Reviews.Schemas.Round{number: 2}

  """
  @spec get_by_number(integer(), integer()) :: Round.t() | nil
  def get_by_number(artifact_id, number) do
    Repo.get_by(Round, artifact_id: artifact_id, number: number)
  end

  @doc """
  Returns the highest-numbered round for an artifact, or `nil` when it has none.

  ## Examples

      iex> Suikou.Reviews.Rounds.latest(artifact.id)
      %Suikou.Reviews.Schemas.Round{number: 3}

  """
  @spec latest(integer()) :: Round.t() | nil
  def latest(artifact_id) do
    Round
    |> where([r], r.artifact_id == ^artifact_id)
    |> order_by([r], desc: r.number)
    |> limit(1)
    |> Repo.one()
  end

  @doc """
  Returns the highest round number for an artifact, or `nil` when it has none.

  ## Examples

      iex> Suikou.Reviews.Rounds.latest_number(artifact.id)
      3

  """
  @spec latest_number(integer()) :: integer() | nil
  def latest_number(artifact_id) do
    Round
    |> where([r], r.artifact_id == ^artifact_id)
    |> select([r], max(r.number))
    |> Repo.one()
  end

  @doc """
  Returns `true` when the round is the latest one for its artifact.

  ## Examples

      iex> Suikou.Reviews.Rounds.latest?(round)
      true

  """
  @spec latest?(Round.t()) :: boolean()
  def latest?(%Round{artifact_id: artifact_id, number: number}) do
    number == latest_number(artifact_id)
  end
end

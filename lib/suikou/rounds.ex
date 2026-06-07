defmodule Suikou.Rounds do
  @moduledoc """
  Round query helpers shared across the review domains. A round is "latest"
  when its number equals the highest round number for its artifact; critique
  and reviews may only attach to the latest round.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Schemas.Round

  @doc """
  Fetches a round by id, or `nil` when none exists.

  ## Examples

      Suikou.Rounds.get(round.id)
      #=> %Suikou.Schemas.Round{number: 1}

      Suikou.Rounds.get("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> nil

  """
  @spec get(Ecto.UUID.t()) :: Round.t() | nil
  def get(round_id), do: Repo.get(Round, round_id)

  @doc """
  Fetches a round by its artifact and round number, or `nil` when none exists.

  ## Examples

      Suikou.Rounds.get_by_number(artifact.id, 2)
      #=> %Suikou.Schemas.Round{number: 2}

  """
  @spec get_by_number(Ecto.UUID.t(), integer()) :: Round.t() | nil
  def get_by_number(artifact_id, number) do
    Repo.get_by(Round, artifact_id: artifact_id, number: number)
  end

  @doc """
  Returns the highest-numbered round for an artifact, or `nil` when it has none.

  ## Examples

      Suikou.Rounds.latest(artifact.id)
      #=> %Suikou.Schemas.Round{number: 3}

  """
  @spec latest(Ecto.UUID.t()) :: Round.t() | nil
  def latest(artifact_id) do
    from(r in Round, as: :round)
    |> where([round: r], r.artifact_id == ^artifact_id)
    |> order_by([round: r], desc: r.number)
    |> limit(1)
    |> Repo.one()
  end

  @doc """
  Returns the highest round number for an artifact, or `nil` when it has none.

  ## Examples

      Suikou.Rounds.latest_number(artifact.id)
      #=> 3

  """
  @spec latest_number(Ecto.UUID.t()) :: integer() | nil
  def latest_number(artifact_id) do
    from(r in Round, as: :round)
    |> where([round: r], r.artifact_id == ^artifact_id)
    |> select([round: r], max(r.number))
    |> Repo.one()
  end

  @doc """
  Returns `true` when the round is the latest one for its artifact.

  ## Examples

      Suikou.Rounds.latest?(round)
      #=> true

  """
  @spec latest?(Round.t()) :: boolean()
  def latest?(%Round{artifact_id: artifact_id, number: number}) do
    number == latest_number(artifact_id)
  end
end

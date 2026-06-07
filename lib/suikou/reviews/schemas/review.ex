defmodule Suikou.Reviews.Schemas.Review do
  @moduledoc """
  A batch submission on a round carrying one verdict. Submitting a review
  publishes the round's pending comments and records the round's disposition.
  """

  use Suikou.Schema

  import Ecto.Changeset

  alias Suikou.Reviews.Schemas.Round

  @verdicts [:approve, :request_changes, :comment]
  @type verdict() :: :approve | :request_changes | :comment

  typed_schema "reviews" do
    field :verdict, Ecto.Enum, values: @verdicts, typed: [null: false]

    belongs_to :round, Round

    timestamps()
  end

  @doc """
  Returns the allowed verdicts.

  ## Examples

      iex> Suikou.Reviews.Schemas.Review.verdicts()
      [:approve, :request_changes, :comment]

  """
  @spec verdicts() :: [verdict()]
  def verdicts, do: @verdicts

  @doc """
  Builds a changeset for a review, requiring a round and verdict.

  ## Examples

      iex> Suikou.Reviews.Schemas.Review.changeset(%{round_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", verdict: :approve}).valid?
      true

      iex> Suikou.Reviews.Schemas.Review.changeset(%{round_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f"}).valid?
      false

  """
  @spec changeset(map()) :: Ecto.Changeset.t()
  def changeset(params) do
    %__MODULE__{}
    |> cast(params, [:round_id, :verdict])
    |> validate_required([:round_id, :verdict])
  end
end

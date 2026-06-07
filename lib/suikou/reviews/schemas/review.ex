defmodule Suikou.Reviews.Schemas.Review do
  @moduledoc """
  A batch submission on a round carrying one verdict. Submitting a review
  publishes the round's pending comments and records the round's disposition.
  """

  use EctoTypedSchema

  import Ecto.Changeset

  alias Suikou.Reviews.Schemas.Round

  @verdicts [:approve, :request_changes, :comment]

  typed_schema "reviews" do
    field :verdict, Ecto.Enum, values: @verdicts, typed: [null: false]

    belongs_to :round, Round

    timestamps()
  end

  @spec verdicts() :: [atom()]
  def verdicts, do: @verdicts

  @spec changeset(map()) :: Ecto.Changeset.t()
  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:round_id, :verdict])
    |> validate_required([:round_id, :verdict])
  end
end

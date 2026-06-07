defmodule Suikou.Reviews.Schemas.Artifact do
  @moduledoc """
  A generated unit under review, bound across rounds by a server-minted id.

  `approved_round` holds the round number an `approve` verdict accepted, or
  `nil` when the artifact is not approved.
  """

  use EctoTypedSchema

  import Ecto.Changeset

  alias Suikou.Reviews.Schemas.Round

  typed_schema "artifacts" do
    field :title, :string, typed: [null: false]
    field :approved_round, :integer

    has_many :rounds, Round

    timestamps()
  end

  @spec create_changeset(map()) :: Ecto.Changeset.t()
  def create_changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:title])
    |> validate_required([:title])
    |> validate_format(:title, ~r/\S/, message: "can't be blank")
  end
end

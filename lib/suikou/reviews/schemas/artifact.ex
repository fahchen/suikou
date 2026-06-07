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

  @doc """
  Builds a changeset for a new artifact, requiring a non-blank title.

  ## Examples

      iex> Suikou.Reviews.Schemas.Artifact.create_changeset(%{title: "Draft"}).valid?
      true

      iex> Suikou.Reviews.Schemas.Artifact.create_changeset(%{title: "  "}).valid?
      false

  """
  @spec create_changeset(map()) :: Ecto.Changeset.t()
  def create_changeset(params) do
    %__MODULE__{}
    |> cast(params, [:title])
    |> validate_required([:title])
    |> validate_format(:title, ~r/\S/, message: "can't be blank")
  end

  @doc """
  Builds a changeset recording the round number an `approve` verdict accepted.

  ## Examples

      iex> Suikou.Reviews.Schemas.Artifact.approve_changeset(%Suikou.Reviews.Schemas.Artifact{}, 2).changes
      %{approved_round: 2}

  """
  @spec approve_changeset(t(), integer()) :: Ecto.Changeset.t()
  def approve_changeset(artifact, round_number) do
    change(artifact, approved_round: round_number)
  end

  @doc """
  Builds a changeset clearing approval, used on dismissal and on round advance.

  ## Examples

      iex> Suikou.Reviews.Schemas.Artifact.clear_approval_changeset(%Suikou.Reviews.Schemas.Artifact{approved_round: 2}).changes
      %{approved_round: nil}

  """
  @spec clear_approval_changeset(t()) :: Ecto.Changeset.t()
  def clear_approval_changeset(artifact) do
    change(artifact, approved_round: nil)
  end
end

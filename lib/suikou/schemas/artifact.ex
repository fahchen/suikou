defmodule Suikou.Schemas.Artifact do
  @moduledoc """
  A generated unit under review, bound across rounds by a server-minted id.

  `approved_round` holds the round number an `approve` verdict accepted, or
  `nil` when the artifact is not approved.
  """

  use Suikou.Schema

  alias Suikou.Schemas.Review
  alias Suikou.Schemas.Round

  typed_schema "artifacts" do
    field :title, :string, typed: [null: false]
    field :approved_round, :integer
    field :file_path, :string, typed: [null: false]
    field :removed_at, :utc_datetime

    belongs_to :review, Review
    has_many :rounds, Round

    timestamps()
  end

  @doc """
  Builds a changeset for an artifact created by selecting a file into a review.

  `review_id` is set from the review struct rather than cast, so a caller can
  never reassign an artifact to another review through params.

  ## Examples

      Suikou.Schemas.Artifact.create_from_file_changeset(review, %{title: "docs/plan.md", file_path: "docs/plan.md"}).valid?
      #=> true

  """
  @spec create_from_file_changeset(Review.t(), map()) :: Ecto.Changeset.t()
  def create_from_file_changeset(review, params) do
    %__MODULE__{review_id: review.id}
    |> cast(params, [:title, :file_path])
    |> validate_required([:title, :file_path])
    |> validate_format(:title, ~r/\S/, message: "can't be blank")
    |> assoc_constraint(:review)
  end

  @doc """
  Builds a changeset soft-removing the artifact from its review at the given time.

  ## Examples

      iex> %{removed_at: ts} = Suikou.Schemas.Artifact.remove_changeset(%Suikou.Schemas.Artifact{}, ~U[2026-06-12 00:00:00Z]).changes
      iex> ts
      ~U[2026-06-12 00:00:00Z]

  """
  @spec remove_changeset(t(), DateTime.t()) :: Ecto.Changeset.t()
  def remove_changeset(artifact, removed_at) do
    change(artifact, removed_at: removed_at)
  end

  @doc """
  Builds a changeset restoring a soft-removed artifact to its review.

  ## Examples

      iex> Suikou.Schemas.Artifact.restore_changeset(%Suikou.Schemas.Artifact{removed_at: ~U[2026-06-12 00:00:00Z]}).changes
      %{removed_at: nil}

  """
  @spec restore_changeset(t()) :: Ecto.Changeset.t()
  def restore_changeset(artifact) do
    change(artifact, removed_at: nil)
  end

  @doc """
  Builds a changeset recording the round number an `approve` verdict accepted.

  ## Examples

      iex> Suikou.Schemas.Artifact.approve_changeset(%Suikou.Schemas.Artifact{}, 2).changes
      %{approved_round: 2}

  """
  @spec approve_changeset(t(), integer()) :: Ecto.Changeset.t()
  def approve_changeset(artifact, round_number) do
    change(artifact, approved_round: round_number)
  end

  @doc """
  Builds a changeset clearing approval, used on dismissal and on round advance.

  ## Examples

      iex> Suikou.Schemas.Artifact.clear_approval_changeset(%Suikou.Schemas.Artifact{approved_round: 2}).changes
      %{approved_round: nil}

  """
  @spec clear_approval_changeset(t()) :: Ecto.Changeset.t()
  def clear_approval_changeset(artifact) do
    change(artifact, approved_round: nil)
  end
end

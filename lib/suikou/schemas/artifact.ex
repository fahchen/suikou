defmodule Suikou.Schemas.Artifact do
  @moduledoc """
  A generated unit under review, bound across rounds by a server-minted id.

  `approved_round` holds the round number an `approve` verdict accepted, or
  `nil` when the artifact is not approved.
  """

  use Suikou.Schema

  alias Suikou.Schemas.Project
  alias Suikou.Schemas.Round

  typed_schema "artifacts" do
    field :title, :string, typed: [null: false]
    field :approved_round, :integer
    field :file_path, :string, typed: [null: false]

    belongs_to :project, Project
    has_many :rounds, Round

    timestamps()
  end

  @doc """
  Builds a changeset for an artifact created by selecting a file under a project.

  `project_id` is set from the project struct rather than cast, so a caller can
  never reassign an artifact to another project through params.

  ## Examples

      Suikou.Schemas.Artifact.create_from_file_changeset(project, %{title: "docs/plan.md", file_path: "docs/plan.md"}).valid?
      #=> true

  """
  @spec create_from_file_changeset(Project.t(), map()) :: Ecto.Changeset.t()
  def create_from_file_changeset(project, params) do
    %__MODULE__{project_id: project.id}
    |> cast(params, [:title, :file_path])
    |> validate_required([:title, :file_path])
    |> validate_format(:title, ~r/\S/, message: "can't be blank")
    |> assoc_constraint(:project)
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

defmodule Suikou.Schemas.Review do
  @moduledoc """
  A review groups the files a reviewer selected under a project. `selection_paths`
  records what was picked — file paths and whole-directory paths (a directory
  stands for every file beneath it) — and is expanded to concrete files when the
  selection is saved. Each expanded file becomes one `Suikou.Schemas.Artifact`
  under the review; the selection is editable, and removing a file soft-removes
  its artifact (see BDR-0018).
  """

  use Suikou.Schema

  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Project

  typed_schema "reviews" do
    field :name, :string, typed: [null: false]
    field :selection_paths, {:array, :string}, default: [], typed: [null: false]

    belongs_to :project, Project
    has_many :artifacts, Artifact

    timestamps()
  end

  @doc """
  Builds a changeset for a review created under a project.

  `project_id` is set from the project struct rather than cast, so a caller can
  never reassign a review to another project through params.

  ## Examples

      Suikou.Schemas.Review.create_changeset(project, %{name: "Launch docs"}).valid?
      #=> true

  """
  @spec create_changeset(Project.t(), map()) :: Ecto.Changeset.t()
  def create_changeset(project, params) do
    %__MODULE__{project_id: project.id}
    |> cast(params, [:name, :selection_paths])
    |> validate_required([:name])
    |> validate_format(:name, ~r/\S/, message: "can't be blank")
    |> assoc_constraint(:project)
  end

  @doc """
  Builds a changeset replacing a review's stored selection (file and directory
  paths). Artifacts are reconciled separately by the reviews context.

  ## Examples

      Suikou.Schemas.Review.selection_changeset(%Suikou.Schemas.Review{}, ["lib", "readme.md"]).changes
      #=> %{selection_paths: ["lib", "readme.md"]}

  """
  @spec selection_changeset(t(), [String.t()]) :: Ecto.Changeset.t()
  def selection_changeset(%__MODULE__{} = review, paths) do
    cast(review, %{selection_paths: paths}, [:selection_paths])
  end

  @doc """
  Builds a changeset that renames an existing review.

  ## Examples

      review = %Suikou.Schemas.Review{name: "Launch docs"}
      Suikou.Schemas.Review.rename_changeset(review, %{name: "Spec pass"}).valid?
      #=> true

  """
  @spec rename_changeset(t(), map()) :: Ecto.Changeset.t()
  def rename_changeset(%__MODULE__{} = review, params) do
    review
    |> cast(params, [:name])
    |> validate_required([:name])
    |> validate_format(:name, ~r/\S/, message: "can't be blank")
  end
end

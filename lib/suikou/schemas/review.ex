defmodule Suikou.Schemas.Review do
  @moduledoc """
  A review groups the artifacts a reviewer wants to review together under a
  project. The reviewed set is described by a polymorphic `source`: a
  `FileSelection` records hand-picked file and directory paths (a directory
  stands for every file beneath it) expanded to artifacts lazily on first open;
  a `GitDiff` records a base/head ref pair whose changed files become the
  review's artifacts (see BDR-0018, BDR-0020).
  """

  use Suikou.Schema

  import PolymorphicEmbed

  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Project
  alias Suikou.Schemas.ReviewSource.FileSelection
  alias Suikou.Schemas.ReviewSource.GitDiff

  @source_types [file_selection: FileSelection, git_diff: GitDiff]

  typed_schema "reviews" do
    field :name, :string, typed: [null: false]

    polymorphic_embeds_one(:source,
      types: @source_types,
      on_type_not_found: :raise,
      on_replace: :update
    )

    belongs_to :project, Project
    has_many :artifacts, Artifact

    timestamps()
  end

  @doc """
  Builds a changeset for a review created under a project. `params` must carry
  a `:source` payload tagged with `__type__` (e.g. `%{__type__: "file_selection",
  selection_paths: [...]}`).

  `project_id` is set from the project struct rather than cast, so a caller can
  never reassign a review to another project through params.

  ## Examples

      Suikou.Schemas.Review.create_changeset(project, %{name: "Launch docs", source: %{__type__: "file_selection", selection_paths: ["docs"]}}).valid?
      #=> true

  """
  @spec create_changeset(Project.t(), map()) :: Ecto.Changeset.t()
  def create_changeset(project, params) do
    %__MODULE__{project_id: project.id}
    |> cast(params, [:name])
    |> validate_required([:name])
    |> validate_format(:name, ~r/\S/, message: "can't be blank")
    |> cast_polymorphic_embed(:source, required: true)
    |> assoc_constraint(:project)
  end

  @doc """
  Builds a changeset replacing a review's file-selection source with a fresh
  list of file and directory paths. Artifacts are reconciled separately by the
  reviews context.

  ## Examples

      review = %Suikou.Schemas.Review{source: %Suikou.Schemas.ReviewSource.FileSelection{selection_paths: []}}
      Suikou.Schemas.Review.selection_changeset(review, ["lib", "readme.md"]).valid?
      #=> true

  """
  @spec selection_changeset(t(), [String.t()]) :: Ecto.Changeset.t()
  def selection_changeset(%__MODULE__{} = review, paths) do
    review
    |> cast(%{source: %{__type__: "file_selection", selection_paths: paths}}, [])
    |> cast_polymorphic_embed(:source, required: true)
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

defmodule Suikou.Schemas.Review do
  @moduledoc """
  A review groups the artifacts a reviewer wants to review together under a
  project. The reviewed set is described by a polymorphic `source`: a
  `FileSelection` records hand-picked file and directory paths (a directory
  stands for every file beneath it) expanded to artifacts lazily on first open;
  a `GitDiff` records a base/head ref pair whose changed files become the
  review's artifacts (see BDR-0018, BDR-0020).

  A review carries both content roots it reads from: `project_path`, the
  checkout its code lives in, and `scratch_path`, the directory an agent writes
  generated output into so a report can be reviewed without being committed. A
  path picks its root with a leading `@scratch` or `@project` marker — see
  `Suikou.ReviewRoots`.
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
    field :project_path, :string, typed: [null: false]
    field :scratch_path, :string, typed: [null: false]
    field :respect_gitignore, :boolean

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

  `project_id` and `project_path` are set from the caller's resolved values
  rather than cast, so a caller can never reassign a review to another project
  or point it at another checkout through params. `scratch_path` is recorded
  once the id exists, by `scratch_changeset/2`.

  ## Examples

      Suikou.Schemas.Review.create_changeset(project, "/projects/app", %{name: "Launch docs", source: %{__type__: "file_selection", selection_paths: ["docs"]}}).valid?
      #=> true

  """
  @spec create_changeset(Project.t(), String.t(), map()) :: Ecto.Changeset.t()
  def create_changeset(project, project_path, params) do
    %__MODULE__{project_id: project.id, project_path: project_path}
    |> cast(params, [:name, :respect_gitignore])
    |> validate_required([:name])
    |> validate_format(:name, ~r/\S/, message: "can't be blank")
    |> cast_polymorphic_embed(:source, required: true)
    |> assoc_constraint(:project)
  end

  @doc """
  Builds a changeset recording where a review's generated output lives. Set
  after insert, since the directory is named for the review's own id.

  ## Examples

      iex> %{scratch_path: path} = Suikou.Schemas.Review.scratch_changeset(%Suikou.Schemas.Review{}, "/data/suikou/app-3f9c2e1a/01a0").changes
      iex> path
      "/data/suikou/app-3f9c2e1a/01a0"

  """
  @spec scratch_changeset(t(), String.t()) :: Ecto.Changeset.t()
  def scratch_changeset(%__MODULE__{} = review, scratch_path) do
    change(review, scratch_path: scratch_path)
  end

  @doc """
  Builds a changeset filing a review under another project. The id comes from the
  project struct rather than params, so a caller can never move a review by
  supplying a raw id.

  ## Examples

      Suikou.Schemas.Review.move_changeset(review, project).valid?
      #=> true

  """
  @spec move_changeset(t(), Project.t()) :: Ecto.Changeset.t()
  def move_changeset(%__MODULE__{} = review, %Project{} = project) do
    review
    |> change(project_id: project.id)
    |> assoc_constraint(:project)
  end

  @doc """
  Builds a changeset setting whether this review's file listings respect
  `.gitignore`. `nil` clears the override so the project decides again.

  ## Examples

      iex> %{respect_gitignore: respect} = Suikou.Schemas.Review.gitignore_changeset(%Suikou.Schemas.Review{}, false).changes
      iex> respect
      false

  """
  @spec gitignore_changeset(t(), boolean() | nil) :: Ecto.Changeset.t()
  def gitignore_changeset(%__MODULE__{} = review, respect) do
    change(review, respect_gitignore: respect)
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

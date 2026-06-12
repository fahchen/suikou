defmodule Suikou.Schemas.Review do
  @moduledoc """
  A review groups the files a reviewer selected under a project. Each selected
  file becomes one `Suikou.Schemas.Artifact` under the review; the selection is
  editable, and removing a file soft-removes its artifact (see BDR-0018).
  """

  use Suikou.Schema

  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Project

  typed_schema "reviews" do
    field :name, :string, typed: [null: false]

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
    |> cast(params, [:name])
    |> validate_required([:name])
    |> validate_format(:name, ~r/\S/, message: "can't be blank")
    |> assoc_constraint(:project)
  end
end

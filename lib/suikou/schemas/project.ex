defmodule Suikou.Schemas.Project do
  @moduledoc """
  A directory on disk registered for review. Scanning a project lists its files
  as candidate artifacts; the reviewer selects one to start reviewing it (see
  BDR-0018). `path` is the absolute directory path and is unique.
  """

  use Suikou.Schema

  alias Suikou.Schemas.Review

  typed_schema "projects" do
    field :name, :string, typed: [null: false]
    field :path, :string, typed: [null: false]
    field :respect_gitignore, :boolean, typed: [null: false]

    has_many :reviews, Review

    timestamps()
  end

  @doc """
  Builds a changeset for a new project, requiring a non-blank name and path.

  Whether `path` actually points at a directory is checked by the context, not
  here, since it is a filesystem side effect.

  ## Examples

      iex> Suikou.Schemas.Project.create_changeset(%{name: "Docs", path: "/tmp/docs"}).valid?
      true

      iex> Suikou.Schemas.Project.create_changeset(%{name: "  ", path: "/tmp/docs"}).valid?
      false

  """
  @spec create_changeset(map()) :: Ecto.Changeset.t()
  def create_changeset(params) do
    %__MODULE__{}
    |> cast(params, [:name, :path, :respect_gitignore])
    |> validate_required([:name, :path])
    |> validate_format(:name, ~r/\S/, message: "can't be blank")
    |> validate_format(:path, ~r/\S/, message: "can't be blank")
    |> unique_constraint(:path)
  end

  @doc """
  Builds a changeset to edit a project's settings. Only `respect_gitignore` is
  editable — `name` and `path` are project identity and stay fixed (the path
  especially must not move once files are anchored to it).

  ## Examples

      iex> Suikou.Schemas.Project.update_changeset(%Suikou.Schemas.Project{}, %{respect_gitignore: false}).valid?
      true

  """
  @spec update_changeset(t(), map()) :: Ecto.Changeset.t()
  def update_changeset(%__MODULE__{} = project, params) do
    cast(project, params, [:respect_gitignore])
  end
end

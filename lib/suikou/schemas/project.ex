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
    |> cast(params, [:name, :path])
    |> validate_required([:name, :path])
    |> validate_format(:name, ~r/\S/, message: "can't be blank")
    |> validate_format(:path, ~r/\S/, message: "can't be blank")
    |> unique_constraint(:path)
  end
end

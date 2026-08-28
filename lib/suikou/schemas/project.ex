defmodule Suikou.Schemas.Project do
  @moduledoc """
  A directory on disk registered for review. Scanning a project lists its files
  as candidate artifacts; the reviewer selects one to start reviewing it (see
  BDR-0018). `path` is the absolute directory path and is unique.
  """

  use Suikou.Schema

  alias Suikou.Schemas.Review
  alias Suikou.Schemas.Settings

  typed_schema "projects" do
    field :name, :string, typed: [null: false]
    field :path, :string, typed: [null: false]
    field :respect_gitignore, :boolean, typed: [null: false]
    field :emoji, :string
    field :review_instructions, :string

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
    |> cast(params, [:name, :path, :respect_gitignore, :emoji, :review_instructions])
    |> validate_required([:name, :path])
    |> validate_format(:name, ~r/\S/, message: "can't be blank")
    |> validate_format(:path, ~r/\S/, message: "can't be blank")
    |> validate_instructions()
    |> unique_constraint(:path)
  end

  @doc """
  Builds a changeset to edit a project's settings: its display `name`, its
  `emoji` badge, its `review_instructions`, and whether it respects
  `.gitignore`. `path` is identity and stays fixed — it must not move once
  files are anchored to it.

  ## Examples

      iex> Suikou.Schemas.Project.update_changeset(%Suikou.Schemas.Project{}, %{name: "Docs"}).valid?
      true

      iex> Suikou.Schemas.Project.update_changeset(%Suikou.Schemas.Project{}, %{name: "  "}).valid?
      false

  """
  @spec update_changeset(t(), map()) :: Ecto.Changeset.t()
  def update_changeset(%__MODULE__{} = project, params) do
    project
    |> cast(params, [:name, :respect_gitignore, :emoji, :review_instructions])
    |> validate_format(:name, ~r/\S/, message: "can't be blank")
    |> validate_instructions()
  end

  # The project's instructions ride along on every agent CLI reply that names
  # the project, so they share the global text's ceiling and its blank handling.
  defp validate_instructions(changeset) do
    changeset
    |> update_change(:review_instructions, &blank_to_nil/1)
    |> validate_length(:review_instructions, max: Settings.max_instructions())
  end

  defp blank_to_nil(nil), do: nil

  defp blank_to_nil(text) do
    trimmed = String.trim(text)
    if trimmed == "", do: nil, else: trimmed
  end
end

defmodule Suikou.Schemas.Project do
  @moduledoc """
  A named board reviews are filed under. A project is a label, never a location:
  the checkout a review reads from lives on the review itself.

  `review_instructions` is the project's own guidance for a reviewing agent, read
  alongside the global text in `Suikou.Settings`.

  `identity` is the repository these reviews are about — a normalised `origin`
  URL, or the main `.git` directory for a remote-less repository (see
  `Suikou.Git.identity/1`). It exists so reviews created from different worktrees
  of one repository land in one project without the agent arranging it. It is
  optional and unique when present: a project made by hand, holding reviews from
  unrelated directories, simply has none.
  """

  use Suikou.Schema

  alias Suikou.Schemas.Review
  alias Suikou.Schemas.Settings

  typed_schema "projects" do
    field :name, :string, typed: [null: false]
    field :identity, :string
    field :respect_gitignore, :boolean, typed: [null: false]
    field :emoji, :string
    field :review_instructions, :string

    has_many :reviews, Review

    timestamps()
  end

  @doc """
  Builds a changeset for a new project, requiring a non-blank name. `identity`
  is resolved by the context from the directory the caller supplied, not cast
  from params, so a caller can never claim another repository's identity.

  ## Examples

      iex> Suikou.Schemas.Project.create_changeset(%{name: "Docs"}).valid?
      true

      iex> Suikou.Schemas.Project.create_changeset(%{name: "  "}).valid?
      false

  """
  @spec create_changeset(map()) :: Ecto.Changeset.t()
  def create_changeset(params) do
    %__MODULE__{}
    |> cast(params, [:name, :respect_gitignore, :emoji, :review_instructions])
    |> validate_required([:name])
    |> validate_format(:name, ~r/\S/, message: "can't be blank")
    |> validate_instructions()
    |> unique_constraint(:identity)
  end

  @doc """
  Builds a changeset recording the repository `identity` a project groups by,
  set programmatically from a resolved checkout rather than cast from params.

  ## Examples

      iex> Suikou.Schemas.Project.identity_changeset(%Suikou.Schemas.Project{}, "github.com/fahchen/suikou").valid?
      true

  """
  @spec identity_changeset(t(), String.t()) :: Ecto.Changeset.t()
  def identity_changeset(%__MODULE__{} = project, identity) do
    project
    |> change(identity: identity)
    |> unique_constraint(:identity)
  end

  @doc """
  Builds a changeset to edit a project's settings: its display `name`, its
  `emoji` badge, its `review_instructions`, and whether it respects
  `.gitignore`. `identity` is not editable — it is resolved from a checkout,
  never typed in.

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

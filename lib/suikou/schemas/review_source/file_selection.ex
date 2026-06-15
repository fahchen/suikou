defmodule Suikou.Schemas.ReviewSource.FileSelection do
  @moduledoc """
  Review source variant for a reviewer-picked list of files and whole
  directories under a project. A directory path stands for every file beneath
  it; the selection is expanded against disk on demand so files added under a
  selected directory join automatically (see BDR-0018).
  """

  use EctoTypedSchema

  import Ecto.Changeset

  @primary_key false
  typed_embedded_schema do
    field :selection_paths, {:array, :string}, default: [], typed: [null: false]
  end

  @doc """
  Builds a changeset for a file-selection source, casting `selection_paths`.
  An empty list is accepted at the embed level — the reviews context enforces
  non-emptiness on creation.

  ## Examples

      iex> Suikou.Schemas.ReviewSource.FileSelection.changeset(%Suikou.Schemas.ReviewSource.FileSelection{}, %{selection_paths: ["lib", "readme.md"]}).valid?
      true

  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(file_selection, params) do
    cast(file_selection, params, [:selection_paths])
  end
end

defmodule Suikou.Schemas.ReviewSource.GitDiff do
  @moduledoc """
  Review source variant for a git-diff review: the artifacts under the review
  are the files changed between two refs of the project's repository, compared
  with three-dot merge-base semantics (`git base...head`). Refs are fixed at
  creation — changing branches means a new review (see BDR-0020).
  """

  use EctoTypedSchema

  import Ecto.Changeset

  @primary_key false
  typed_embedded_schema do
    field :base_ref, :string, typed: [null: false]
    field :head_ref, :string, typed: [null: false]
  end

  @doc """
  Builds a changeset for a git-diff source, requiring both refs.

  ## Examples

      iex> Suikou.Schemas.ReviewSource.GitDiff.changeset(%Suikou.Schemas.ReviewSource.GitDiff{}, %{base_ref: "main", head_ref: "topic"}).valid?
      true

      iex> Suikou.Schemas.ReviewSource.GitDiff.changeset(%Suikou.Schemas.ReviewSource.GitDiff{}, %{base_ref: "main"}).valid?
      false

  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(git_diff, params) do
    git_diff
    |> cast(params, [:base_ref, :head_ref])
    |> validate_required([:base_ref, :head_ref])
  end
end

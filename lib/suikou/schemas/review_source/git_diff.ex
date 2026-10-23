defmodule Suikou.Schemas.ReviewSource.GitDiff do
  @moduledoc """
  Review source variant for a git-diff review: the artifacts under the review
  are the files changed between two refs of the project's repository, compared
  with three-dot merge-base semantics (`git base...head`). Refs are stored as
  branch names and re-resolved live on every render — a ref that no longer
  exists surfaces as an error state instead of a stale snapshot (see BDR-0025).

  `stack_ref` optionally names a review stack: a branch an agent cut from the
  source into small, dependency-ordered commits, verified at attach time to
  carry exactly the source change (see BDR-0028). `nil` when the review has no
  stack.
  """

  use EctoTypedSchema

  import Ecto.Changeset

  @primary_key false
  typed_embedded_schema do
    field :base_ref, :string, typed: [null: false]
    field :head_ref, :string, typed: [null: false]
    field :stack_ref, :string
  end

  @doc """
  Builds a changeset for a git-diff source, requiring both refs. `stack_ref` is
  optional.

  ## Examples

      iex> params = %{base_ref: "main", head_ref: "topic"}
      iex> Suikou.Schemas.ReviewSource.GitDiff.changeset(%Suikou.Schemas.ReviewSource.GitDiff{}, params).valid?
      true

      iex> Suikou.Schemas.ReviewSource.GitDiff.changeset(%Suikou.Schemas.ReviewSource.GitDiff{}, %{base_ref: "main"}).valid?
      false

      iex> params = %{base_ref: "main", head_ref: "topic", stack_ref: "topic-review"}
      iex> Suikou.Schemas.ReviewSource.GitDiff.changeset(%Suikou.Schemas.ReviewSource.GitDiff{}, params).changes.stack_ref
      "topic-review"

  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(git_diff, params) do
    git_diff
    |> cast(params, [:base_ref, :head_ref, :stack_ref])
    |> validate_required([:base_ref, :head_ref])
  end
end

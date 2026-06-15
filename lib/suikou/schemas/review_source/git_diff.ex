defmodule Suikou.Schemas.ReviewSource.GitDiff do
  @moduledoc """
  Review source variant for a git-diff review: the artifacts under the review
  are the files changed between two refs of the project's repository, compared
  with three-dot merge-base semantics (`git base...head`). Refs are fixed at
  creation — changing branches means a new review (see BDR-0020).
  """

  use EctoTypedSchema

  import Ecto.Changeset

  # `base_sha`/`head_sha` are the commit SHAs `base_ref`/`head_ref` resolved to
  # at creation time, pinned by the reviews context so the reviewer can later
  # tell whether the refs have moved since (see BDR-0020). Both are nullable
  # at the schema level so legacy rows whose backfill could not resolve a
  # vanished ref still load; the create changeset enforces them for new rows.
  @primary_key false
  typed_embedded_schema do
    field :base_ref, :string, typed: [null: false]
    field :head_ref, :string, typed: [null: false]
    field :base_sha, :string
    field :head_sha, :string
  end

  @doc """
  Builds a changeset for a git-diff source, requiring both refs and both
  creation-time commit SHAs.

  ## Examples

      iex> params = %{base_ref: "main", head_ref: "topic", base_sha: "abc", head_sha: "def"}
      iex> Suikou.Schemas.ReviewSource.GitDiff.changeset(%Suikou.Schemas.ReviewSource.GitDiff{}, params).valid?
      true

      iex> Suikou.Schemas.ReviewSource.GitDiff.changeset(%Suikou.Schemas.ReviewSource.GitDiff{}, %{base_ref: "main"}).valid?
      false

  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(git_diff, params) do
    git_diff
    |> cast(params, [:base_ref, :head_ref, :base_sha, :head_sha])
    |> validate_required([:base_ref, :head_ref, :base_sha, :head_sha])
  end
end

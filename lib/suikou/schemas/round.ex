defmodule Suikou.Schemas.Round do
  @moduledoc """
  A versioned state of an artifact: one full content snapshot plus its round
  number. `content_hash` is the byte-level hash used to decide round bumps.
  """

  use Suikou.Schema

  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Submission

  typed_schema "rounds" do
    field :number, :integer, typed: [null: false]
    field :content, :string, typed: [null: false]
    field :content_hash, :string, typed: [null: false]
    field :draft_verdict, Ecto.Enum, values: [:approve, :request_changes, :comment]

    belongs_to :artifact, Artifact
    has_many :comments, Comment
    has_many :submissions, Submission

    timestamps()
  end

  @doc """
  Builds a changeset for a round snapshot, requiring artifact, number, content,
  and content hash.

  ## Examples

      iex> Suikou.Schemas.Round.changeset(%{artifact_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", number: 1, content: "x", content_hash: "ABC"}).valid?
      true

      iex> Suikou.Schemas.Round.changeset(%{number: 1}).valid?
      false

  """
  @spec changeset(map()) :: Ecto.Changeset.t()
  def changeset(params) do
    %__MODULE__{}
    |> cast(params, [:artifact_id, :number, :content, :content_hash])
    |> validate_required([:artifact_id, :number, :content, :content_hash])
    |> unique_constraint([:artifact_id, :number])
  end

  @doc """
  Builds a changeset refreshing a draft round's content snapshot and hash from a
  re-read of its file on disk (see BDR-0018).

  ## Examples

      iex> Suikou.Schemas.Round.resnapshot_changeset(%Suikou.Schemas.Round{}, %{content: "x", content_hash: "ABC"}).valid?
      true

  """
  @spec resnapshot_changeset(t(), map()) :: Ecto.Changeset.t()
  def resnapshot_changeset(round, params) do
    round
    |> cast(params, [:content, :content_hash])
    |> validate_required([:content, :content_hash])
  end

  @doc """
  Builds a changeset storing the reviewer's in-progress verdict on a draft round
  before they submit. Cleared to `nil` once the round is submitted.

  ## Examples

      iex> Suikou.Schemas.Round.draft_verdict_changeset(%Suikou.Schemas.Round{}, :approve).changes
      %{draft_verdict: :approve}

      iex> Suikou.Schemas.Round.draft_verdict_changeset(%Suikou.Schemas.Round{}, "approve").changes
      %{draft_verdict: :approve}

  """
  @spec draft_verdict_changeset(t(), :approve | :request_changes | :comment | String.t()) ::
          Ecto.Changeset.t()
  def draft_verdict_changeset(round, verdict) do
    cast(round, %{draft_verdict: verdict}, [:draft_verdict])
  end
end

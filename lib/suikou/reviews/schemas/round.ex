defmodule Suikou.Reviews.Schemas.Round do
  @moduledoc """
  A versioned state of an artifact: one full content snapshot plus its round
  number. `content_hash` is the byte-level hash used to decide round bumps.
  """

  use Suikou.Schema

  import Ecto.Changeset

  alias Suikou.Reviews.Schemas.Artifact
  alias Suikou.Reviews.Schemas.Comment
  alias Suikou.Reviews.Schemas.Review

  typed_schema "rounds" do
    field :number, :integer, typed: [null: false]
    field :content, :string, typed: [null: false]
    field :content_hash, :string, typed: [null: false]

    belongs_to :artifact, Artifact
    has_many :comments, Comment
    has_many :reviews, Review

    timestamps()
  end

  @doc """
  Builds a changeset for a round snapshot, requiring artifact, number, content,
  and content hash.

  ## Examples

      iex> Suikou.Reviews.Schemas.Round.changeset(%{artifact_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", number: 1, content: "x", content_hash: "ABC"}).valid?
      true

      iex> Suikou.Reviews.Schemas.Round.changeset(%{number: 1}).valid?
      false

  """
  @spec changeset(map()) :: Ecto.Changeset.t()
  def changeset(params) do
    %__MODULE__{}
    |> cast(params, [:artifact_id, :number, :content, :content_hash])
    |> validate_required([:artifact_id, :number, :content, :content_hash])
    |> unique_constraint([:artifact_id, :number])
  end
end

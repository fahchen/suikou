defmodule Suikou.Reviews.Schemas.Round do
  @moduledoc """
  A versioned state of an artifact: one full content snapshot plus its round
  number. `content_hash` is the byte-level hash used to decide round bumps.
  """

  use EctoTypedSchema

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

  @spec changeset(map()) :: Ecto.Changeset.t()
  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:artifact_id, :number, :content, :content_hash])
    |> validate_required([:artifact_id, :number, :content, :content_hash])
    |> unique_constraint([:artifact_id, :number])
  end
end

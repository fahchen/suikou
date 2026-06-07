defmodule Suikou.Reviews.Schemas.Reply do
  @moduledoc """
  A reply in a comment's thread. The human reviewer authors comments and
  replies; the agent may only reply, via a dedicated reply path.
  """

  use EctoTypedSchema

  import Ecto.Changeset

  alias Suikou.Reviews.Schemas.Comment

  @authors [:human, :agent]

  typed_schema "replies" do
    field :author, Ecto.Enum, values: @authors, typed: [null: false]
    field :body, :string, typed: [null: false]

    belongs_to :comment, Comment

    timestamps()
  end

  @doc """
  Builds a changeset for a reply, requiring comment, author, and a non-blank body.

  ## Examples

      iex> Suikou.Reviews.Schemas.Reply.changeset(%{comment_id: 1, author: :human, body: "noted"}).valid?
      true

      iex> Suikou.Reviews.Schemas.Reply.changeset(%{comment_id: 1, author: :human, body: " "}).valid?
      false

  """
  @spec changeset(map()) :: Ecto.Changeset.t()
  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:comment_id, :author, :body])
    |> validate_required([:comment_id, :author, :body])
    |> validate_format(:body, ~r/\S/, message: "can't be blank")
  end
end

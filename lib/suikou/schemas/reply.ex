defmodule Suikou.Schemas.Reply do
  @moduledoc """
  A reply in a comment's thread. The human reviewer authors comments and
  replies; the agent may only reply, via a dedicated reply path.

  Replies share the comment lifecycle: a human reply is `:pending` until its
  round is submitted, an agent reply is `:published` immediately. `round_id`
  records the round a reply was written in. `author` and `status` are set by the
  reply path, never cast from input.
  """

  use Suikou.Schema

  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Round

  @authors [:human, :agent]
  @statuses [:pending, :published]

  @type author() :: :human | :agent
  @type status() :: :pending | :published

  typed_schema "replies" do
    field :author, Ecto.Enum, values: @authors, typed: [null: false]
    field :body, :string, typed: [null: false]
    field :status, Ecto.Enum, values: @statuses, default: :pending, typed: [null: false]

    belongs_to :comment, Comment
    belongs_to :round, Round

    timestamps()
  end

  @doc """
  Builds a changeset for a reply on `reply` (a struct that already carries the
  programmatic `author`, `status`, and `round_id`, set when the struct is built),
  casting `comment_id` and a non-blank `body` from `params`.

  ## Examples

      iex> reply = %Suikou.Schemas.Reply{author: :human, status: :pending}
      iex> Suikou.Schemas.Reply.changeset(reply, %{comment_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", body: "noted"}).valid?
      true

      iex> reply = %Suikou.Schemas.Reply{author: :human, status: :pending}
      iex> Suikou.Schemas.Reply.changeset(reply, %{comment_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", body: " "}).valid?
      false

  """
  @spec changeset(Ecto.Schema.t(), map()) :: Ecto.Changeset.t()
  def changeset(reply \\ %__MODULE__{}, params) do
    reply
    |> cast(params, [:comment_id, :body])
    |> validate_required([:comment_id, :body])
    |> validate_format(:body, ~r/\S/, message: "can't be blank")
  end

  @doc """
  Builds a changeset editing a pending reply's body.

  ## Examples

      iex> Suikou.Schemas.Reply.edit_changeset(%Suikou.Schemas.Reply{}, %{body: "revised"}).valid?
      true

      iex> Suikou.Schemas.Reply.edit_changeset(%Suikou.Schemas.Reply{}, %{body: " "}).valid?
      false

  """
  @spec edit_changeset(t(), map()) :: Ecto.Changeset.t()
  def edit_changeset(reply, params) do
    reply
    |> cast(params, [:body])
    |> validate_required([:body])
    |> validate_format(:body, ~r/\S/, message: "can't be blank")
  end
end

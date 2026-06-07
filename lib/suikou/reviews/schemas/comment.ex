defmodule Suikou.Reviews.Schemas.Comment do
  @moduledoc """
  A unit of structured human critique on a round: a scope, a critique type, a
  body, lifecycle status, and optional line anchor.

  A carried-forward comment is a new row whose `origin_id` links back to the
  row it was carried from; `outdated` marks a carried comment whose quote no
  longer exists in the new snapshot.
  """

  use EctoTypedSchema

  import Ecto.Changeset

  alias Suikou.Reviews.Schemas.Reply
  alias Suikou.Reviews.Schemas.Round

  @scopes [:line, :file, :review]
  @critique_types [:fix_required, :needs_answer, :note]
  @statuses [:pending, :published]

  typed_schema "comments" do
    field :scope, Ecto.Enum, values: @scopes, typed: [null: false]
    field :start_line, :integer
    field :end_line, :integer
    field :quote, :string
    field :critique_type, Ecto.Enum, values: @critique_types, typed: [null: false]
    field :body, :string, typed: [null: false]
    field :status, Ecto.Enum, values: @statuses, default: :pending, typed: [null: false]
    field :resolved_round, :integer
    field :outdated, :boolean, default: false, typed: [null: false]

    belongs_to :round, Round
    belongs_to :origin, __MODULE__
    has_many :replies, Reply

    timestamps()
  end

  @spec scopes() :: [atom()]
  def scopes, do: @scopes

  @spec critique_types() :: [atom()]
  def critique_types, do: @critique_types

  @spec author_changeset(map()) :: Ecto.Changeset.t()
  def author_changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [
      :round_id,
      :scope,
      :start_line,
      :end_line,
      :quote,
      :critique_type,
      :body
    ])
    |> validate_required([:round_id, :scope, :critique_type, :body])
    |> validate_format(:body, ~r/\S/, message: "can't be blank")
  end

  @spec edit_changeset(t(), map()) :: Ecto.Changeset.t()
  def edit_changeset(comment, attrs) do
    comment
    |> cast(attrs, [:body, :critique_type])
    |> validate_required([:body, :critique_type])
    |> validate_format(:body, ~r/\S/, message: "can't be blank")
  end
end

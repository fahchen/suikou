defmodule Suikou.Schemas.Comment do
  @moduledoc """
  A unit of structured human critique on a round: a scope, a critique type, a
  body, lifecycle status, and optional line anchor.

  A carried-forward comment is a new row whose `origin_id` links back to the
  row it was carried from; `outdated` marks a carried comment whose quote no
  longer exists in the new snapshot.
  """

  use Suikou.Schema

  alias Suikou.Schemas.Reply
  alias Suikou.Schemas.Round

  @scopes [:line, :file, :review]
  @critique_types [:fix_required, :needs_answer, :note]
  @statuses [:pending, :published]

  @type scope() :: :line | :file | :review
  @type critique_type() :: :fix_required | :needs_answer | :note
  @type status() :: :pending | :published

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

  @doc """
  Returns the allowed comment scopes.

  ## Examples

      iex> Suikou.Schemas.Comment.scopes()
      [:line, :file, :review]

  """
  @spec scopes() :: [scope()]
  def scopes, do: @scopes

  @doc """
  Returns the allowed critique types.

  ## Examples

      iex> Suikou.Schemas.Comment.critique_types()
      [:fix_required, :needs_answer, :note]

  """
  @spec critique_types() :: [critique_type()]
  def critique_types, do: @critique_types

  @doc """
  Builds a changeset for authoring a critique, requiring round, scope, critique
  type, and a non-blank body.

  ## Examples

      iex> Suikou.Schemas.Comment.author_changeset(%{round_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", scope: :review, critique_type: :note, body: "ok"}).valid?
      true

      iex> Suikou.Schemas.Comment.author_changeset(%{round_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", scope: :review, critique_type: :note, body: " "}).valid?
      false

  """
  @spec author_changeset(map()) :: Ecto.Changeset.t()
  def author_changeset(params) do
    %__MODULE__{}
    |> cast(params, [
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
    |> validate_line_anchor()
  end

  defp validate_line_anchor(changeset) do
    case get_field(changeset, :scope) do
      :line ->
        changeset
        |> validate_required([:start_line, :end_line])
        |> validate_line_order()

      _other ->
        changeset
    end
  end

  defp validate_line_order(changeset) do
    start_line = get_field(changeset, :start_line)
    end_line = get_field(changeset, :end_line)

    if is_integer(start_line) and is_integer(end_line) and start_line > end_line do
      add_error(changeset, :end_line, "must be greater than or equal to start line")
    else
      changeset
    end
  end

  @doc """
  Builds a changeset for editing a comment's body and critique type.

  ## Examples

      iex> Suikou.Schemas.Comment.edit_changeset(%Suikou.Schemas.Comment{}, %{body: "revised", critique_type: :note}).valid?
      true

  """
  @spec edit_changeset(t(), map()) :: Ecto.Changeset.t()
  def edit_changeset(comment, params) do
    comment
    |> cast(params, [:body, :critique_type])
    |> validate_required([:body, :critique_type])
    |> validate_format(:body, ~r/\S/, message: "can't be blank")
  end

  @doc """
  Builds a changeset marking a comment resolved at the given round number.

  ## Examples

      iex> Suikou.Schemas.Comment.resolve_changeset(%Suikou.Schemas.Comment{}, 2).changes
      %{resolved_round: 2}

  """
  @spec resolve_changeset(t(), integer()) :: Ecto.Changeset.t()
  def resolve_changeset(comment, resolved_round) do
    change(comment, resolved_round: resolved_round)
  end
end

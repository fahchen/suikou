defmodule Suikou.Schemas.Comment do
  @moduledoc """
  A unit of structured human critique on a round: a scope, a critique type, a
  body, lifecycle status, and optional line anchor.

  A carried-forward comment is a new row whose `origin_id` links back to the
  row it was carried from; `outdated` marks a carried comment whose quote no
  longer exists in the new snapshot.
  """

  use Suikou.Schema

  import PolymorphicEmbed

  alias Suikou.Schemas.Anchor.LineRange
  alias Suikou.Schemas.Reply
  alias Suikou.Schemas.Round

  @scopes [:line, :file, :review]
  @critique_types [:fix_required, :needs_answer, :note]
  @statuses [:pending, :published]

  @anchor_types [line_range: LineRange]

  @type scope() :: :line | :file | :review
  @type critique_type() :: :fix_required | :needs_answer | :note
  @type status() :: :pending | :published

  typed_schema "comments" do
    field :scope, Ecto.Enum, values: @scopes, typed: [null: false]

    polymorphic_embeds_one(:anchor,
      types: @anchor_types,
      on_type_not_found: :raise,
      on_replace: :update
    )

    polymorphic_embeds_one(:original_anchor,
      types: @anchor_types,
      on_type_not_found: :raise,
      on_replace: :update
    )

    field :original_round, :integer
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
  type, and a non-blank body. A `line`-scoped comment also requires an `anchor`
  and a frozen `original_anchor` (set to the same selector at creation) plus the
  `original_round` it was authored at; `file` and `review` comments carry none.

  ## Examples

      iex> Suikou.Schemas.Comment.author_changeset(%{round_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", scope: :review, critique_type: :note, body: "ok"}).valid?
      true

      iex> Suikou.Schemas.Comment.author_changeset(%{round_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", scope: :review, critique_type: :note, body: " "}).valid?
      false

  """
  @spec author_changeset(map()) :: Ecto.Changeset.t()
  def author_changeset(params) do
    %__MODULE__{}
    |> cast(params, [:round_id, :scope, :critique_type, :body])
    |> validate_required([:round_id, :scope, :critique_type, :body])
    |> validate_format(:body, ~r/\S/, message: "can't be blank")
    |> cast_anchor(params)
  end

  defp cast_anchor(changeset, params) do
    case get_field(changeset, :scope) do
      :line ->
        changeset
        |> put_change(:original_round, params[:original_round])
        |> validate_required([:original_round])
        |> cast_polymorphic_embed(:anchor, required: true)
        |> cast_polymorphic_embed(:original_anchor, required: true)

      _other ->
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

  @doc """
  Builds a changeset reopening a resolved comment by clearing `resolved_round`.

  ## Examples

      iex> Suikou.Schemas.Comment.unresolve_changeset(%Suikou.Schemas.Comment{resolved_round: 2}).changes
      %{resolved_round: nil}

  """
  @spec unresolve_changeset(t()) :: Ecto.Changeset.t()
  def unresolve_changeset(comment) do
    change(comment, resolved_round: nil)
  end

  @doc """
  Builds a changeset relocating a line-scoped comment to a fresh `anchor`,
  clearing the `outdated` flag. Used when a human manually re-anchors a comment
  that lost its mapping across rounds (see BDR-0017).

  ## Examples

      iex> anchor = %{__type__: "line_range", start_line: 3, end_line: 3, quote: "c"}
      iex> Suikou.Schemas.Comment.relocate_changeset(%Suikou.Schemas.Comment{outdated: true}, %{anchor: anchor}).valid?
      true

  """
  @spec relocate_changeset(t(), %{anchor: map()}) :: Ecto.Changeset.t()
  def relocate_changeset(comment, params) do
    comment
    |> cast(params, [])
    |> put_change(:outdated, false)
    |> cast_polymorphic_embed(:anchor, required: true)
  end
end

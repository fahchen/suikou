defmodule Suikou.Schemas.Anchor.LineRange do
  @moduledoc """
  Line-range anchor for text, markdown, and code: a start line, an end line, and
  the captured quote of those lines. The quote is retained for display and for
  rendering an outdated comment against the text it was about; re-anchoring maps
  the range through the round-to-round line diff (see BDR-0017).
  """

  use EctoTypedSchema

  import Ecto.Changeset

  alias Suikou.Schemas.Anchor.LineOrder

  @primary_key false
  typed_embedded_schema do
    field :start_line, :integer, typed: [null: false]
    field :end_line, :integer, typed: [null: false]
    field :quote, :string, typed: [null: false]
  end

  @doc """
  Builds a changeset for a line-range anchor, requiring a positive start line, a
  quote, and an end line at or after the start line.

  ## Examples

      iex> Suikou.Schemas.Anchor.LineRange.changeset(%Suikou.Schemas.Anchor.LineRange{}, %{start_line: 10, end_line: 12, quote: "a\\nb\\nc"}).valid?
      true

      iex> Suikou.Schemas.Anchor.LineRange.changeset(%Suikou.Schemas.Anchor.LineRange{}, %{start_line: 12, end_line: 10, quote: "x"}).valid?
      false

  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(line_range, params) do
    line_range
    |> cast(params, [:start_line, :end_line, :quote])
    |> validate_required([:start_line, :end_line, :quote])
    |> validate_number(:start_line, greater_than: 0)
    |> LineOrder.validate()
  end
end

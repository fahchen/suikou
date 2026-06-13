defmodule Suikou.Schemas.Anchor.DiffHunk do
  @moduledoc """
  Diff-hunk anchor for a git-diff review (see BDR-0020): a side of the diff
  (`:old` or `:new`), a contiguous run of lines within that side, and the
  captured quote of those lines with the `+`/`-` patch markers stripped. v1
  selects within a single side only. Re-anchoring locates the stored quote
  among the side's content lines in the re-snapshotted diff.
  """

  use EctoTypedSchema

  import Ecto.Changeset

  alias Suikou.Schemas.Anchor.LineOrder

  @sides [:old, :new]

  @type side() :: :old | :new

  @primary_key false
  typed_embedded_schema do
    field :side, Ecto.Enum, values: @sides, typed: [null: false]
    field :start_line, :integer, typed: [null: false]
    field :end_line, :integer, typed: [null: false]
    field :quote, :string, typed: [null: false]
  end

  @doc """
  Builds a changeset for a diff-hunk anchor: a side, a positive start line, a
  quote, and an end line at or after the start. Reuses the shared line-order
  rule with `LineRange` (see `Suikou.Schemas.Anchor.LineOrder`).

  ## Examples

      iex> Suikou.Schemas.Anchor.DiffHunk.changeset(%Suikou.Schemas.Anchor.DiffHunk{}, %{side: :new, start_line: 10, end_line: 12, quote: "a\\nb\\nc"}).valid?
      true

      iex> Suikou.Schemas.Anchor.DiffHunk.changeset(%Suikou.Schemas.Anchor.DiffHunk{}, %{side: :new, start_line: 12, end_line: 10, quote: "x"}).valid?
      false

  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(diff_hunk, params) do
    diff_hunk
    |> cast(params, [:side, :start_line, :end_line, :quote])
    |> validate_required([:side, :start_line, :end_line, :quote])
    |> validate_number(:start_line, greater_than: 0)
    |> LineOrder.validate()
  end
end

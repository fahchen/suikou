defmodule Suikou.Schemas.Anchor.Element do
  @moduledoc """
  Element anchor for an HTML artifact review (see BDR-0021): a CSS `selector`
  identifying the rendered element and the captured text `quote` the reviewer
  pointed at. The `selector` is required; the `quote` may be empty, since an
  element can carry no text (the reviewer anchors to the element itself).
  Element anchors are not line ranges, so
  this variant does not share the line-order helper used by `LineRange` and
  `DiffHunk`. Re-anchoring is client-only: the iframe DOM resolves the selector
  on every render and decides outdated; the server never relocates an element
  anchor.
  """

  use EctoTypedSchema

  import Ecto.Changeset

  # Caps keep a client from persisting megabyte blobs: real CSS selectors fit
  # well under 1 KiB, and a meaningful text quote is bounded by what fits on
  # screen — 10 KiB is generous headroom.
  @selector_max 1_000
  @quote_max 10_000

  @primary_key false
  typed_embedded_schema do
    field :selector, :string, typed: [null: false]
    field :quote, :string, typed: [null: false]
  end

  @doc """
  Builds a changeset for an element anchor, requiring the CSS `selector`. The
  captured `quote` is optional — an element the reviewer points at may have no
  text. Both fields are capped (#{@selector_max} chars for `selector`,
  #{@quote_max} for `quote`) so a client cannot store unbounded blobs.

  ## Examples

      iex> Suikou.Schemas.Anchor.Element.changeset(%Suikou.Schemas.Anchor.Element{}, %{selector: "main > p:nth-of-type(2)", quote: "Hello"}).valid?
      true

      iex> Suikou.Schemas.Anchor.Element.changeset(%Suikou.Schemas.Anchor.Element{}, %{selector: "main > hr", quote: ""}).valid?
      true

      iex> Suikou.Schemas.Anchor.Element.changeset(%Suikou.Schemas.Anchor.Element{}, %{selector: "", quote: ""}).valid?
      false

      iex> Suikou.Schemas.Anchor.Element.changeset(%Suikou.Schemas.Anchor.Element{}, %{selector: String.duplicate("a", 1_001), quote: "Hello"}).valid?
      false

  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(element, params) do
    element
    |> cast(params, [:selector, :quote])
    |> validate_required([:selector])
    |> validate_length(:selector, max: @selector_max)
    |> validate_length(:quote, max: @quote_max)
  end
end

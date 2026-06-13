defmodule Suikou.Schemas.Anchor.Element do
  @moduledoc """
  Element anchor for an HTML artifact review (see BDR-0021): a CSS `selector`
  identifying the rendered element and the captured text `quote` the reviewer
  pointed at. Both fields are required. Element anchors are not line ranges, so
  this variant does not share the line-order helper used by `LineRange` and
  `DiffHunk`. Re-anchoring is client-only: the iframe DOM resolves the selector
  on every render and decides outdated; the server never relocates an element
  anchor.
  """

  use EctoTypedSchema

  import Ecto.Changeset

  @primary_key false
  typed_embedded_schema do
    field :selector, :string, typed: [null: false]
    field :quote, :string, typed: [null: false]
  end

  @doc """
  Builds a changeset for an element anchor, requiring both the CSS `selector`
  and the captured `quote`.

  ## Examples

      iex> Suikou.Schemas.Anchor.Element.changeset(%Suikou.Schemas.Anchor.Element{}, %{selector: "main > p:nth-of-type(2)", quote: "Hello"}).valid?
      true

      iex> Suikou.Schemas.Anchor.Element.changeset(%Suikou.Schemas.Anchor.Element{}, %{selector: "", quote: ""}).valid?
      false

  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(element, params) do
    element
    |> cast(params, [:selector, :quote])
    |> validate_required([:selector, :quote])
  end
end

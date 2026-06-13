defmodule Suikou.Schemas.Anchor.LineOrder do
  @moduledoc """
  Shared start-line/end-line ordering check for anchor changesets. Adds an
  `:end_line` error when both fields are integers and `end_line` precedes
  `start_line`. Used by every anchor variant that selects a contiguous line
  range so the order rule cannot drift between variants (see BDR-0017,
  BDR-0020).
  """

  import Ecto.Changeset

  @doc """
  Returns `changeset` unchanged when `start_line` and `end_line` are absent,
  non-integer, or already in order; otherwise adds an `:end_line` error.

  ## Examples

      iex> changeset = Ecto.Changeset.cast({%{}, %{start_line: :integer, end_line: :integer}}, %{start_line: 1, end_line: 2}, [:start_line, :end_line])
      iex> Suikou.Schemas.Anchor.LineOrder.validate(changeset).valid?
      true

      iex> changeset = Ecto.Changeset.cast({%{}, %{start_line: :integer, end_line: :integer}}, %{start_line: 5, end_line: 3}, [:start_line, :end_line])
      iex> Suikou.Schemas.Anchor.LineOrder.validate(changeset).valid?
      false

  """
  @spec validate(Ecto.Changeset.t()) :: Ecto.Changeset.t()
  def validate(changeset) do
    start_line = get_field(changeset, :start_line)
    end_line = get_field(changeset, :end_line)

    if is_integer(start_line) and is_integer(end_line) and end_line < start_line do
      add_error(changeset, :end_line, "must be greater than or equal to start line")
    else
      changeset
    end
  end
end

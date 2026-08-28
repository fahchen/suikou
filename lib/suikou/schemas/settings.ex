defmodule Suikou.Schemas.Settings do
  @moduledoc """
  Application-wide settings. The table holds exactly one row, written through
  `Suikou.Settings`.

  `review_instructions` is the human's standing guidance for every review: the
  agent CLI hands it to the agent alongside the project's own instructions.
  """

  use Suikou.Schema

  # Both instruction levels share this ceiling: the text rides along on agent
  # CLI replies, so an unbounded blob would flood the agent's context.
  @max_instructions 10_000

  typed_schema "settings" do
    field :review_instructions, :string

    timestamps()
  end

  @doc """
  Builds a changeset for the settings row. Blank instructions become `nil`, so
  an emptied text area reads the same as one never filled in.

  ## Examples

      iex> Suikou.Schemas.Settings.changeset(%Suikou.Schemas.Settings{}, %{review_instructions: "Reply in English."}).valid?
      true

      iex> changeset = Suikou.Schemas.Settings.changeset(%Suikou.Schemas.Settings{}, %{review_instructions: "  "})
      iex> Ecto.Changeset.get_field(changeset, :review_instructions)
      nil

  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(%__MODULE__{} = settings, params) do
    settings
    |> cast(params, [:review_instructions])
    |> update_change(:review_instructions, &blank_to_nil/1)
    |> validate_length(:review_instructions, max: @max_instructions)
  end

  @doc """
  The longest instruction text either level accepts.

  ## Examples

      iex> Suikou.Schemas.Settings.max_instructions()
      10_000

  """
  @spec max_instructions() :: pos_integer()
  def max_instructions, do: @max_instructions

  defp blank_to_nil(nil), do: nil

  defp blank_to_nil(text) do
    trimmed = String.trim(text)
    if trimmed == "", do: nil, else: trimmed
  end
end

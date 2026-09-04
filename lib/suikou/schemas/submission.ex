defmodule Suikou.Schemas.Submission do
  @moduledoc """
  The record that a round was submitted. Submitting publishes the review's
  pending critique and opens the next draft round.
  """

  use Suikou.Schema

  alias Suikou.Schemas.Round

  typed_schema "submissions" do
    belongs_to :round, Round

    timestamps()
  end

  @doc """
  Builds a changeset for a submission, requiring a round.

  ## Examples

      iex> Suikou.Schemas.Submission.changeset(%{round_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f"}).valid?
      true

      iex> Suikou.Schemas.Submission.changeset(%{}).valid?
      false

  """
  @spec changeset(map()) :: Ecto.Changeset.t()
  def changeset(params) do
    %__MODULE__{}
    |> cast(params, [:round_id])
    |> validate_required([:round_id])
  end
end

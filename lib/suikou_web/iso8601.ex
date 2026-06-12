defmodule SuikouWeb.Iso8601 do
  @moduledoc """
  Renders a stored timestamp as an ISO 8601 string carrying its UTC offset.

  Ecto stores `naive_datetime` in UTC but without a zone; emitting it untagged
  makes the frontend's `new Date(...)` read it as the viewer's local wall-clock,
  skewing ages by the viewer's offset. Tagging the offset is what makes the
  instant agree across timezones.
  """

  @doc """
  Formats a UTC-stored `NaiveDateTime` (or an already-zoned `DateTime`) as an
  ISO 8601 string with its offset.

  ## Examples

      iex> SuikouWeb.Iso8601.utc(~N[2026-06-12 15:34:54])
      "2026-06-12T15:34:54Z"

      iex> SuikouWeb.Iso8601.utc(~U[2026-06-12 15:34:54Z])
      "2026-06-12T15:34:54Z"

  """
  @spec utc(NaiveDateTime.t() | DateTime.t()) :: String.t()
  def utc(%NaiveDateTime{} = naive) do
    naive |> DateTime.from_naive!("Etc/UTC") |> DateTime.to_iso8601()
  end

  def utc(%DateTime{} = datetime), do: DateTime.to_iso8601(datetime)
end

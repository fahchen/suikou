defmodule Suikou.Reviews.Anchor do
  @moduledoc """
  Line-anchor helpers. A line-scoped comment captures the quoted source text at
  creation so it can be relocated on a later round by an exact match of that
  quote (no fuzzy matching, see BDR-0010).
  """

  @doc """
  Captures the source text of lines `start_line..end_line` (1-based, inclusive).
  """
  @spec capture_quote(String.t(), pos_integer(), pos_integer()) :: String.t()
  def capture_quote(content, start_line, end_line) do
    content
    |> String.split("\n")
    |> Enum.slice((start_line - 1)..(end_line - 1)//1)
    |> Enum.join("\n")
  end

  @doc """
  Finds the quote's new line range in `content` by exact match. Returns
  `{start_line, end_line}` (1-based, inclusive) or `nil` when the quote is gone.
  """
  @spec reanchor(String.t(), String.t()) :: {pos_integer(), pos_integer()} | nil
  def reanchor(content, quote) do
    content_lines = String.split(content, "\n")
    quote_lines = String.split(quote, "\n")

    case index_of_sublist(content_lines, quote_lines) do
      nil -> nil
      i -> {i + 1, i + length(quote_lines)}
    end
  end

  @spec index_of_sublist([String.t()], [String.t()]) :: non_neg_integer() | nil
  defp index_of_sublist(lines, sublist) do
    window = length(sublist)
    last = length(lines) - window

    if last < 0 do
      nil
    else
      Enum.find(0..last//1, fn i ->
        Enum.slice(lines, i, window) == sublist
      end)
    end
  end
end

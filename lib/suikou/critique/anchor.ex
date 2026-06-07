defmodule Suikou.Critique.Anchor do
  @moduledoc """
  Line-range anchor helpers. A line-scoped comment captures the quoted source of
  its lines at creation, then re-anchors on a later round by mapping its line
  range through the round-to-round line diff: an unchanged line moves to its new
  position, an edited or deleted line marks the comment outdated (see BDR-0017).
  """

  alias Suikou.Schemas.Anchor.LineRange

  @doc """
  Builds the `line_range` anchor params for lines `start_line..end_line` (1-based,
  inclusive) of `content`, capturing their quoted source. The result is a params
  map carrying the polymorphic `__type__`, ready for `cast_polymorphic_embed/3`.

  ## Examples

      iex> Suikou.Critique.Anchor.capture("line one\\nline two\\nline three", 2, 3)
      %{__type__: "line_range", start_line: 2, end_line: 3, quote: "line two\\nline three"}

  """
  @spec capture(String.t(), pos_integer(), pos_integer()) :: %{
          __type__: String.t(),
          start_line: pos_integer(),
          end_line: pos_integer(),
          quote: String.t()
        }
  def capture(content, start_line, end_line) do
    %{
      __type__: "line_range",
      start_line: start_line,
      end_line: end_line,
      quote: quote_lines(content, start_line, end_line)
    }
  end

  @doc """
  Re-anchors a `line_range` from `prev_content` into `new_content` by mapping its
  range through the line diff. Returns `{:ok, line_range}` with the mapped range
  and re-captured quote when every anchored line is unchanged and contiguous, or
  `:outdated` when any anchored line was edited or deleted.

  ## Examples

      iex> Suikou.Critique.Anchor.reanchor("a\\nb\\nc", "x\\na\\nb\\nc", %Suikou.Schemas.Anchor.LineRange{start_line: 2, end_line: 3, quote: "b\\nc"})
      {:ok, %Suikou.Schemas.Anchor.LineRange{start_line: 3, end_line: 4, quote: "b\\nc"}}

      iex> Suikou.Critique.Anchor.reanchor("a\\nb\\nc", "a\\nB\\nc", %Suikou.Schemas.Anchor.LineRange{start_line: 2, end_line: 2, quote: "b"})
      :outdated

  """
  @spec reanchor(String.t(), String.t(), LineRange.t()) :: {:ok, LineRange.t()} | :outdated
  def reanchor(prev_content, new_content, %LineRange{start_line: start_line, end_line: end_line}) do
    prev_lines = String.split(prev_content, "\n")
    new_lines = String.split(new_content, "\n")

    case map_range(prev_lines, new_lines, start_line, end_line) do
      {new_start, new_end} ->
        quote = Enum.join(Enum.slice(new_lines, (new_start - 1)..(new_end - 1)//1), "\n")
        {:ok, %LineRange{start_line: new_start, end_line: new_end, quote: quote}}

      nil ->
        :outdated
    end
  end

  defp map_range(prev_lines, new_lines, start_line, end_line) do
    line_map = line_map(prev_lines, new_lines)
    mapped = Enum.map(start_line..end_line//1, &Map.get(line_map, &1))

    if Enum.all?(mapped, &is_integer/1) and consecutive?(mapped) do
      {hd(mapped), List.last(mapped)}
    end
  end

  defp line_map(prev_lines, new_lines) do
    prev_lines
    |> List.myers_difference(new_lines)
    |> Enum.reduce({1, 1, %{}}, fn
      {:eq, lines}, {old_no, new_no, acc} ->
        acc =
          Enum.reduce(0..(length(lines) - 1)//1, acc, fn offset, acc ->
            Map.put(acc, old_no + offset, new_no + offset)
          end)

        {old_no + length(lines), new_no + length(lines), acc}

      {:del, lines}, {old_no, new_no, acc} ->
        {old_no + length(lines), new_no, acc}

      {:ins, lines}, {old_no, new_no, acc} ->
        {old_no, new_no + length(lines), acc}
    end)
    |> elem(2)
  end

  defp consecutive?(line_numbers) do
    line_numbers
    |> Enum.chunk_every(2, 1, :discard)
    |> Enum.all?(fn [a, b] -> b - a == 1 end)
  end

  defp quote_lines(content, start_line, end_line) do
    content
    |> String.split("\n")
    |> Enum.slice((start_line - 1)..(end_line - 1)//1)
    |> Enum.join("\n")
  end
end

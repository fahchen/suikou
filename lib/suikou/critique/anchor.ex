defmodule Suikou.Critique.Anchor do
  @moduledoc """
  Line-range anchor helpers. A line-scoped comment captures the quoted source of
  its lines at creation; because content is read live rather than stored, the
  comment's position is then resolved by locating that quote in the current file
  each render. A quote that no longer appears marks the comment outdated.
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
  Locates a comment's captured `quote` in `content`, returning the 1-based
  inclusive line range it now occupies. Content is read live rather than stored,
  so a comment's line numbers are resolved by finding its quote each render.

  Returns `{:ok, {start_line, end_line}}` for the contiguous run of lines equal
  to the quote, choosing the occurrence nearest `hint_start` (the comment's
  last-known start line) when the quote appears more than once, or `:not_found`
  when the quote no longer appears, which marks the comment outdated.

  ## Examples

      iex> Suikou.Critique.Anchor.locate("a\\nb\\nc", "b", 2)
      {:ok, {2, 2}}

      iex> Suikou.Critique.Anchor.locate("a\\nb\\nc", "x", 2)
      :not_found

  """
  @spec locate(String.t(), String.t(), pos_integer()) ::
          {:ok, {pos_integer(), pos_integer()}} | :not_found
  def locate(content, quote, hint_start) do
    content_lines = String.split(content, "\n")
    quote_lines = String.split(quote, "\n")
    span = length(quote_lines)
    total = length(content_lines)

    starts =
      if span > total do
        []
      else
        Enum.filter(0..(total - span)//1, fn i ->
          Enum.slice(content_lines, i, span) == quote_lines
        end)
      end

    case starts do
      [] -> :not_found
      found -> {:ok, nearest(found, span, hint_start)}
    end
  end

  defp nearest(starts, span, hint_start) do
    start = Enum.min_by(starts, &abs(&1 + 1 - hint_start))
    {start + 1, start + span}
  end

  @type resolved() :: %{start_line: pos_integer(), end_line: pos_integer(), quote: String.t()}

  @doc """
  Resolves a stored line anchor against live `content`, returning its current
  view and whether it is outdated. A located quote yields its present line range
  (not outdated); a quote that no longer appears, or unreadable content, leaves
  the anchor at its last-known lines and marks it outdated. A `nil` anchor (a
  file- or review-scoped comment) resolves to `{nil, false}`.

  ## Examples

      iex> Suikou.Critique.Anchor.resolve(%Suikou.Schemas.Anchor.LineRange{start_line: 2, end_line: 2, quote: "b"}, "x\\nb\\nc")
      {%{start_line: 2, end_line: 2, quote: "b"}, false}

      iex> Suikou.Critique.Anchor.resolve(%Suikou.Schemas.Anchor.LineRange{start_line: 2, end_line: 2, quote: "b"}, "gone\\n")
      {%{start_line: 2, end_line: 2, quote: "b"}, true}

  """
  @spec resolve(LineRange.t() | nil, String.t() | nil) :: {resolved() | nil, boolean()}
  def resolve(nil, _content), do: {nil, false}

  def resolve(%LineRange{} = anchor, content) when is_binary(content) do
    case locate(content, anchor.quote, anchor.start_line) do
      {:ok, {start_line, end_line}} ->
        {%{start_line: start_line, end_line: end_line, quote: anchor.quote}, false}

      :not_found ->
        {stale(anchor), true}
    end
  end

  def resolve(%LineRange{} = anchor, nil), do: {stale(anchor), true}

  defp stale(%LineRange{} = anchor) do
    %{start_line: anchor.start_line, end_line: anchor.end_line, quote: anchor.quote}
  end

  defp quote_lines(content, start_line, end_line) do
    content
    |> String.split("\n")
    |> Enum.slice((start_line - 1)..(end_line - 1)//1)
    |> Enum.join("\n")
  end
end

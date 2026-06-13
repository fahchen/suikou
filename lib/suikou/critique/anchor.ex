defmodule Suikou.Critique.Anchor do
  @moduledoc """
  Anchor capture and live re-anchoring for located comments. A line-scoped
  comment captures the quoted source of its lines at creation; a diff-hunk
  comment captures the prefix-stripped lines on one side of the diff. Because
  content is read live rather than stored, an anchor's position is resolved by
  locating its quote in the current content on every render. A quote that no
  longer appears marks the comment outdated (see BDR-0017, BDR-0020).
  """

  alias Suikou.Schemas.Anchor.DiffHunk
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
  Builds the `diff_hunk` anchor params for lines `start_line..end_line` on
  `side` of `diff_text` (the live unified diff), capturing the prefix-stripped
  quote of those lines on that side only. The reviewer's selection always lies
  on a single side (`:old` or `:new`) in v1 (see BDR-0020).

  ## Examples

      iex> diff = "@@ -1,1 +1,2 @@\\n a\\n+b"
      iex> Suikou.Critique.Anchor.capture_diff_hunk(diff, :new, 1, 2)
      %{__type__: "diff_hunk", side: :new, start_line: 1, end_line: 2, quote: "a\\nb"}

  """
  @spec capture_diff_hunk(String.t(), DiffHunk.side(), pos_integer(), pos_integer()) :: %{
          __type__: String.t(),
          side: DiffHunk.side(),
          start_line: pos_integer(),
          end_line: pos_integer(),
          quote: String.t()
        }
  def capture_diff_hunk(diff_text, side, start_line, end_line) do
    %{
      __type__: "diff_hunk",
      side: side,
      start_line: start_line,
      end_line: end_line,
      quote: quote_diff_side(diff_text, side, start_line, end_line)
    }
  end

  @doc """
  Locates a comment's captured `quote` among `content_lines` (the live file
  already split on newlines), returning the 1-based inclusive line range it now
  occupies. The caller splits once and resolves every comment against the same
  lines, so a file is split once per render rather than once per comment.

  Returns `{:ok, {start_line, end_line}}` for the contiguous run of lines equal
  to the quote, choosing the occurrence nearest `hint_start` (the comment's
  last-known start line) when the quote appears more than once, or `:not_found`
  when the quote no longer appears, which marks the comment outdated.

  ## Examples

      iex> Suikou.Critique.Anchor.locate(["a", "b", "c"], "b", 2)
      {:ok, {2, 2}}

      iex> Suikou.Critique.Anchor.locate(["a", "b", "c"], "x", 2)
      :not_found

  """
  @spec locate([String.t()], String.t(), pos_integer()) ::
          {:ok, {pos_integer(), pos_integer()}} | :not_found
  def locate(content_lines, quote, hint_start) do
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

  @type resolved_line() :: %{
          start_line: pos_integer(),
          end_line: pos_integer(),
          quote: String.t()
        }
  @type resolved_diff() :: %{
          side: DiffHunk.side(),
          start_line: pos_integer(),
          end_line: pos_integer(),
          quote: String.t()
        }
  @type resolved() :: resolved_line() | resolved_diff()

  @doc """
  Resolves a stored anchor against the live content, returning its current view
  and whether it is outdated. A `%LineRange{}` resolves against `content_lines`
  (the live file split on newlines); a `%DiffHunk{}` resolves against the live
  unified diff text. A located quote yields its present range (not outdated);
  a quote that no longer appears, or content the resolver cannot read, leaves
  the anchor at its last-known position and marks it outdated. A `nil` anchor
  (`:artifact`- or `:review`-scoped comment) resolves to `{nil, false}`.

  ## Examples

      iex> Suikou.Critique.Anchor.resolve(%Suikou.Schemas.Anchor.LineRange{start_line: 2, end_line: 2, quote: "b"}, ["x", "b", "c"])
      {%{start_line: 2, end_line: 2, quote: "b"}, false}

      iex> Suikou.Critique.Anchor.resolve(%Suikou.Schemas.Anchor.LineRange{start_line: 2, end_line: 2, quote: "b"}, ["gone"])
      {%{start_line: 2, end_line: 2, quote: "b"}, true}

      iex> diff = "@@ -1,1 +1,2 @@\\n a\\n+b"
      iex> Suikou.Critique.Anchor.resolve(%Suikou.Schemas.Anchor.DiffHunk{side: :new, start_line: 2, end_line: 2, quote: "b"}, diff)
      {%{side: :new, start_line: 2, end_line: 2, quote: "b"}, false}

  """
  @spec resolve(LineRange.t() | DiffHunk.t() | nil, [String.t()] | binary() | nil) ::
          {resolved() | nil, boolean()}
  def resolve(nil, _content), do: {nil, false}

  def resolve(%LineRange{} = anchor, content_lines) when is_list(content_lines) do
    case locate(content_lines, anchor.quote, anchor.start_line) do
      {:ok, {start_line, end_line}} ->
        {line_view(start_line, end_line, anchor.quote), false}

      :not_found ->
        {stale_line(anchor), true}
    end
  end

  def resolve(%LineRange{} = anchor, _other), do: {stale_line(anchor), true}

  def resolve(%DiffHunk{} = anchor, diff_text) when is_binary(diff_text) do
    rows = diff_side_rows(diff_text, anchor.side)

    case locate_diff_rows(rows, anchor.quote, anchor.start_line) do
      {:ok, {start_line, end_line}} ->
        {diff_view(anchor.side, start_line, end_line, anchor.quote), false}

      :not_found ->
        {stale_diff(anchor), true}
    end
  end

  def resolve(%DiffHunk{} = anchor, _other), do: {stale_diff(anchor), true}

  defp stale_line(%LineRange{} = anchor) do
    line_view(anchor.start_line, anchor.end_line, anchor.quote)
  end

  defp stale_diff(%DiffHunk{} = anchor) do
    diff_view(anchor.side, anchor.start_line, anchor.end_line, anchor.quote)
  end

  defp line_view(start_line, end_line, quote) do
    %{start_line: start_line, end_line: end_line, quote: quote}
  end

  defp diff_view(side, start_line, end_line, quote) do
    %{side: side, start_line: start_line, end_line: end_line, quote: quote}
  end

  defp quote_lines(content, start_line, end_line) do
    content
    |> String.split("\n")
    |> Enum.slice((start_line - 1)..(end_line - 1)//1)
    |> Enum.join("\n")
  end

  defp quote_diff_side(diff_text, side, start_line, end_line) do
    diff_text
    |> diff_side_rows(side)
    |> Enum.filter(fn {line_no, _text} -> line_no >= start_line and line_no <= end_line end)
    |> Enum.map_join("\n", &elem(&1, 1))
  end

  defp locate_diff_rows(rows, quote, hint_start) do
    quote_lines = String.split(quote, "\n")
    span = length(quote_lines)
    total = length(rows)

    if span > total or span == 0 do
      :not_found
    else
      rows_tuple = List.to_tuple(rows)
      pick_match(rows_tuple, total, span, quote_lines, hint_start)
    end
  end

  defp pick_match(rows_tuple, total, span, quote_lines, hint_start) do
    starts =
      Enum.filter(0..(total - span)//1, fn i ->
        slice_texts(rows_tuple, i, span) == quote_lines
      end)

    case starts do
      [] ->
        :not_found

      found ->
        idx = Enum.min_by(found, &nearest_row_distance(rows_tuple, &1, hint_start))
        {first_line, _text} = elem(rows_tuple, idx)
        {last_line, _last_text} = elem(rows_tuple, idx + span - 1)
        {:ok, {first_line, last_line}}
    end
  end

  defp slice_texts(rows_tuple, start, span) do
    for offset <- 0..(span - 1)//1, do: rows_tuple |> elem(start + offset) |> elem(1)
  end

  defp nearest_row_distance(rows_tuple, idx, hint_start) do
    {line_no, _text} = elem(rows_tuple, idx)
    abs(line_no - hint_start)
  end

  defp diff_side_rows(diff_text, side) do
    diff_text
    |> String.split("\n")
    |> walk_diff(side, nil, nil, [])
    |> Enum.reverse()
  end

  defp walk_diff([], _side, _old_no, _new_no, acc), do: acc

  defp walk_diff([line | tail], side, old_no, new_no, acc) when is_binary(line) do
    case parse_hunk_header(line) do
      {:ok, old_start, new_start} -> walk_diff(tail, side, old_start, new_start, acc)
      :error -> step_body(line, tail, side, old_no, new_no, acc)
    end
  end

  # Before the first hunk header we know neither side's line number, so body
  # lines (the `diff --git`/`---`/`+++` header block) are simply skipped.
  defp step_body(_line, tail, side, nil, nil, acc), do: walk_diff(tail, side, nil, nil, acc)

  defp step_body(line, tail, side, old_no, new_no, acc) do
    case body_line(line) do
      {:context, text} ->
        acc2 = collect_side(side, old_no, new_no, text, acc)
        walk_diff(tail, side, old_no + 1, new_no + 1, acc2)

      {:old, text} ->
        acc2 = if side == :old, do: [{old_no, text} | acc], else: acc
        walk_diff(tail, side, old_no + 1, new_no, acc2)

      {:new, text} ->
        acc2 = if side == :new, do: [{new_no, text} | acc], else: acc
        walk_diff(tail, side, old_no, new_no + 1, acc2)

      :skip ->
        walk_diff(tail, side, old_no, new_no, acc)
    end
  end

  defp collect_side(:old, old_no, _new_no, text, acc), do: [{old_no, text} | acc]
  defp collect_side(:new, _old_no, new_no, text, acc), do: [{new_no, text} | acc]

  defp body_line(" " <> text), do: {:context, text}
  defp body_line("-" <> text), do: {:old, text}
  defp body_line("+" <> text), do: {:new, text}
  defp body_line(_other), do: :skip

  # `@@ -A[,B] +C[,D] @@ [section]` — section label is optional, counts default
  # to 1 when absent.
  defp parse_hunk_header("@@ -" <> rest) do
    with [counts, _trailing] <- String.split(rest, " @@", parts: 2),
         [old, new] <- String.split(counts, " +", parts: 2),
         {old_start, _rest_old} <- Integer.parse(old),
         {new_start, _rest_new} <- Integer.parse(new) do
      {:ok, old_start, new_start}
    else
      _other -> :error
    end
  end

  defp parse_hunk_header(_other), do: :error
end

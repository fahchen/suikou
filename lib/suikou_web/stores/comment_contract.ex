defmodule SuikouWeb.Stores.CommentContract do
  @moduledoc """
  Shared Musubi schema fragments for comment store payloads and snapshots.
  """

  @doc """
  Declares a rendered comment-list field with the shared snapshot shape.
  """
  defmacro comments_items_field(name \\ :items) do
    quote do
      field(unquote(name), list(unquote(rendered_comment_type_ast())))
    end
  end

  @doc """
  Declares the per-file comment-thread field used by the review root store.
  """
  defmacro files_comments_field(name \\ :files_comments) do
    quote do
      field(
        unquote(name),
        list(%{
          artifact_id: String.t(),
          path: String.t(),
          items: list(unquote(rendered_comment_type_ast()))
        })
      )
    end
  end

  @doc """
  Declares an optional comment-anchor payload field.
  """
  defmacro optional_anchor_field(name \\ :anchor) do
    quote do
      field(unquote(name), unquote(anchor_payload_type_ast(true)))
    end
  end

  @doc """
  Declares a required comment-anchor payload field.
  """
  defmacro required_anchor_field(name \\ :anchor) do
    quote do
      field(unquote(name), unquote(anchor_payload_type_ast(false)))
    end
  end

  defp rendered_comment_type_ast do
    quote do
      %{
        id: String.t(),
        scope: :review | :artifact | :located,
        critique_type: :fix_required | :needs_answer | :note,
        status: :pending | :published,
        body: String.t(),
        resolved: boolean(),
        resolved_round: integer() | nil,
        outdated: boolean(),
        drifted: boolean(),
        authored_round: integer(),
        inserted_at: String.t(),
        anchor: unquote(anchor_type_ast()),
        replies:
          list(%{
            id: String.t(),
            author: :human | :agent,
            status: :pending | :published,
            body: String.t(),
            inserted_at: String.t()
          })
      }
    end
  end

  defp anchor_type_ast do
    maybe_nil(rendered_anchor_type_ast(), true)
  end

  defp anchor_payload_type_ast(allow_nil) do
    base =
      quote do
        %{type: :line_range, start_line: integer(), end_line: integer()}
        | %{type: :diff_hunk, side: :old | :new, start_line: integer(), end_line: integer()}
        | %{type: :element, selector: String.t(), quote: String.t()}
      end

    maybe_nil(base, allow_nil)
  end

  defp rendered_anchor_type_ast do
    quote do
      %{type: :line_range, start_line: integer(), end_line: integer(), quote: String.t()}
      | %{
          type: :diff_hunk,
          side: :old | :new,
          start_line: integer(),
          end_line: integer(),
          quote: String.t()
        }
      | %{type: :element, selector: String.t(), quote: String.t()}
    end
  end

  defp maybe_nil(base, true) do
    quote do
      unquote(base) | nil
    end
  end

  defp maybe_nil(base, false), do: base
end

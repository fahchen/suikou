defmodule SuikouWeb.Stores.CommentRendering do
  @moduledoc """
  Shared snapshot builders for comment threads.

  `SuikouWeb.Stores.CommentsStore` renders a single artifact's thread under the
  `ReviewStore`, and `SuikouWeb.Stores.ReviewStore` renders every minted file's
  thread under `:files_comments` in all-files mode. Both must resolve anchors
  against the same live content and tag them with the same discriminator so the
  client narrowing stays uniform, which is why this module owns the rendering
  primitives.
  """

  alias Suikou.Artifacts
  alias Suikou.Critique
  alias Suikou.Schemas.Anchor.DiffHunk
  alias Suikou.Schemas.Anchor.Element
  alias Suikou.Schemas.Anchor.LineRange
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply
  alias SuikouWeb.Iso8601

  @doc """
  Loads the live content for an artifact in the shape its anchors resolve
  against: file-selection artifacts answer the file split on newlines, git-diff
  artifacts answer the live unified diff text. `nil` when the source is
  unreadable or the artifact id is missing.

  ## Examples

      iex> SuikouWeb.Stores.CommentRendering.live_content(nil)
      nil

  """
  @spec live_content(String.t() | nil) :: [String.t()] | String.t() | nil
  def live_content(nil), do: nil

  def live_content(artifact_id) do
    case Artifacts.content_source(artifact_id) do
      {:ok, {:file, path}} ->
        case File.read(path) do
          {:ok, bytes} -> String.split(bytes, "\n")
          {:error, _posix} -> nil
        end

      {:ok, {:inline, diff, "text/x-diff"}} ->
        diff

      {:error, _reason} ->
        nil
    end
  end

  @doc """
  Renders one comment into the snapshot shape the React surface consumes.

  Resolves the stored anchor against `content` (the value returned by
  `live_content/1`), folds the discriminator back onto the resolved anchor,
  and renders every reply.

  ## Examples

  Pure rendering depends on `Suikou.Schemas.Comment`, which requires `Repo` to
  load, so the runnable doctest just confirms the function exists:

      iex> is_function(&SuikouWeb.Stores.CommentRendering.render_comment/2, 2)
      true

  """
  @spec render_comment(Comment.t(), [String.t()] | String.t() | nil) :: map()
  def render_comment(%Comment{} = comment, content) do
    {anchor, outdated} = Critique.resolve_anchor(comment.anchor, content)

    %{
      id: comment.id,
      scope: comment.scope,
      critique_type: comment.critique_type,
      status: comment.status,
      body: comment.body,
      resolved: not is_nil(comment.resolved_round),
      resolved_round: comment.resolved_round,
      outdated: outdated,
      original_round: comment.original_round,
      carried: not is_nil(comment.origin_id),
      inserted_at: Iso8601.utc(comment.inserted_at),
      anchor: tagged_anchor(comment.anchor, anchor),
      replies: Enum.map(comment.replies, &render_reply/1)
    }
  end

  # Wrap the resolved anchor view with the kind discriminator that drives the
  # client tagged-union narrowing. Today only `:line_range` exists; future kinds
  # add a clause without reshaping the read contract.
  defp tagged_anchor(nil, _resolved), do: nil

  defp tagged_anchor(%LineRange{}, resolved) when is_map(resolved) do
    Map.put(resolved, :type, :line_range)
  end

  defp tagged_anchor(%DiffHunk{}, resolved) when is_map(resolved) do
    Map.put(resolved, :type, :diff_hunk)
  end

  defp tagged_anchor(%Element{}, resolved) when is_map(resolved) do
    Map.put(resolved, :type, :element)
  end

  defp render_reply(%Reply{} = reply) do
    %{
      id: reply.id,
      author: reply.author,
      body: reply.body,
      inserted_at: Iso8601.utc(reply.inserted_at)
    }
  end
end

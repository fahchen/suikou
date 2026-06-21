defmodule Suikou.Critique do
  @moduledoc """
  Public API for the critique domain: human comment authoring and lifecycle, and
  threaded discussion.

  This facade is the only module other layers may call; its internal submodules
  are reachable only from within the domain.
  """

  alias Suikou.Critique.Anchor
  alias Suikou.Critique.Comments
  alias Suikou.Critique.Discussion
  alias Suikou.Events
  alias Suikou.Reads
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply

  @doc """
  Adds a pending critique to the latest round. See
  `Suikou.Critique.Comments.add/1`.

  ## Examples

      Suikou.Critique.add_comment(%{round_id: round.id, scope: :review, critique_type: :note, body: "ok"})
      #=> {:ok, %Suikou.Schemas.Comment{status: :pending}}

  """
  def add_comment(params), do: params |> Comments.add() |> broadcast_comment_change()

  @doc """
  Edits a Draft (pending) comment's body. See `Suikou.Critique.Comments.edit/2`.

  ## Examples

      Suikou.Critique.edit_comment(comment.id, %{body: "revised", critique_type: :note})
      #=> {:ok, %Suikou.Schemas.Comment{body: "revised"}}

  """
  def edit_comment(comment_id, params),
    do: comment_id |> Comments.edit(params) |> broadcast_comment_change()

  @doc """
  Deletes a Draft (pending) comment. See `Suikou.Critique.Comments.delete/1`.

  ## Examples

      Suikou.Critique.delete_comment(comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{}}

  """
  def delete_comment(comment_id), do: comment_id |> Comments.delete() |> broadcast_comment_change()

  @doc """
  Marks an Open comment resolved. See `Suikou.Critique.Comments.resolve/1`.

  ## Examples

      Suikou.Critique.resolve_comment(comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{resolved_round: 1}}

  """
  def resolve_comment(comment_id), do: comment_id |> Comments.resolve() |> broadcast_comment_change()

  @doc """
  Relocates a `:located` comment to a fresh tagged `anchor` payload, re-capturing
  its quote from the live file. See `Suikou.Critique.Comments.relocate/2`.

  ## Examples

      Suikou.Critique.relocate_comment(comment.id, %{type: "line_range", start_line: 4, end_line: 5})
      #=> {:ok, %Suikou.Schemas.Comment{}}

  """
  def relocate_comment(comment_id, anchor_params),
    do: comment_id |> Comments.relocate(anchor_params) |> broadcast_comment_change()

  @doc """
  Appends a human reply to an Open or Resolved comment, auto-reopening a Resolved
  one. See `Suikou.Critique.Discussion.reply_as_human/2`.

  ## Examples

      Suikou.Critique.reply_as_human(comment.id, "noted")
      #=> {:ok, %Suikou.Schemas.Reply{author: :human, status: :pending}}

  """
  def reply_as_human(comment_id, body),
    do: comment_id |> Discussion.reply_as_human(body) |> broadcast_reply_change()

  @doc """
  Appends an agent reply to an Open comment. See
  `Suikou.Critique.Discussion.reply_as_agent/2`.

  ## Examples

      Suikou.Critique.reply_as_agent(comment.id, "fixed")
      #=> {:ok, %Suikou.Schemas.Reply{author: :agent, status: :published}}

  """
  def reply_as_agent(comment_id, body),
    do: comment_id |> Discussion.reply_as_agent(body) |> broadcast_reply_change()

  @doc """
  Edits a human's own pending reply. See `Suikou.Critique.Discussion.edit_reply/2`.

  ## Examples

      Suikou.Critique.edit_reply(reply.id, "revised")
      #=> {:ok, %Suikou.Schemas.Reply{body: "revised"}}

  """
  def edit_reply(reply_id, body),
    do: reply_id |> Discussion.edit_reply(body) |> broadcast_reply_change()

  @doc """
  Deletes a human's own pending reply. See `Suikou.Critique.Discussion.delete_reply/1`.

  ## Examples

      Suikou.Critique.delete_reply(reply.id)
      #=> {:ok, %Suikou.Schemas.Reply{}}

  """
  def delete_reply(reply_id), do: reply_id |> Discussion.delete_reply() |> broadcast_reply_change()

  @doc """
  Resolves a stored line anchor against the live file's `content_lines`,
  returning its current view and a freshness status (`:current`, `:drifted`, or
  `:outdated`). See `Suikou.Critique.Anchor.resolve/2`.

  ## Examples

      Suikou.Critique.resolve_anchor(comment.anchor, ["x", "b", "c"])
      #=> {%{start_line: 2, end_line: 2, quote: "b"}, :current}

  """
  defdelegate resolve_anchor(anchor, content_lines), to: Anchor, as: :resolve

  defp broadcast_comment_change({:ok, %Comment{round_id: round_id}} = result) do
    round_id |> Reads.review_id_for_round() |> Events.review_changed()
    result
  end

  defp broadcast_comment_change(result), do: result

  defp broadcast_reply_change({:ok, %Reply{comment_id: comment_id}} = result) do
    comment_id |> Reads.review_id_for_comment() |> Events.review_changed()
    result
  end

  defp broadcast_reply_change(result), do: result
end

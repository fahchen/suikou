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

  @doc """
  Adds a pending critique to the latest round. See
  `Suikou.Critique.Comments.add/1`.

  ## Examples

      Suikou.Critique.add_comment(%{round_id: round.id, scope: :review, critique_type: :note, body: "ok"})
      #=> {:ok, %Suikou.Schemas.Comment{status: :pending}}

  """
  defdelegate add_comment(params), to: Comments, as: :add

  @doc """
  Edits a Draft (pending) comment's body. See `Suikou.Critique.Comments.edit/2`.

  ## Examples

      Suikou.Critique.edit_comment(comment.id, %{body: "revised", critique_type: :note})
      #=> {:ok, %Suikou.Schemas.Comment{body: "revised"}}

  """
  defdelegate edit_comment(comment_id, params), to: Comments, as: :edit

  @doc """
  Deletes a Draft (pending) comment. See `Suikou.Critique.Comments.delete/1`.

  ## Examples

      Suikou.Critique.delete_comment(comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{}}

  """
  defdelegate delete_comment(comment_id), to: Comments, as: :delete

  @doc """
  Marks an Open comment resolved. See `Suikou.Critique.Comments.resolve/1`.

  ## Examples

      Suikou.Critique.resolve_comment(comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{resolved_round: 1}}

  """
  defdelegate resolve_comment(comment_id), to: Comments, as: :resolve

  @doc """
  Relocates a `:located` comment to a fresh tagged `anchor` payload, re-capturing
  its quote from the live file. See `Suikou.Critique.Comments.relocate/2`.

  ## Examples

      Suikou.Critique.relocate_comment(comment.id, %{type: "line_range", start_line: 4, end_line: 5})
      #=> {:ok, %Suikou.Schemas.Comment{}}

  """
  defdelegate relocate_comment(comment_id, anchor_params), to: Comments, as: :relocate

  @doc """
  Appends a human reply to an Open or Resolved comment, auto-reopening a Resolved
  one. See `Suikou.Critique.Discussion.reply_as_human/2`.

  ## Examples

      Suikou.Critique.reply_as_human(comment.id, "noted")
      #=> {:ok, %Suikou.Schemas.Reply{author: :human, status: :pending}}

  """
  defdelegate reply_as_human(comment_id, body), to: Discussion

  @doc """
  Appends an agent reply to an Open comment. See
  `Suikou.Critique.Discussion.reply_as_agent/2`.

  ## Examples

      Suikou.Critique.reply_as_agent(comment.id, "fixed")
      #=> {:ok, %Suikou.Schemas.Reply{author: :agent, status: :published}}

  """
  defdelegate reply_as_agent(comment_id, body), to: Discussion

  @doc """
  Edits a human's own pending reply. See `Suikou.Critique.Discussion.edit_reply/2`.

  ## Examples

      Suikou.Critique.edit_reply(reply.id, "revised")
      #=> {:ok, %Suikou.Schemas.Reply{body: "revised"}}

  """
  defdelegate edit_reply(reply_id, body), to: Discussion

  @doc """
  Deletes a human's own pending reply. See `Suikou.Critique.Discussion.delete_reply/1`.

  ## Examples

      Suikou.Critique.delete_reply(reply.id)
      #=> {:ok, %Suikou.Schemas.Reply{}}

  """
  defdelegate delete_reply(reply_id), to: Discussion

  @doc """
  Resolves a stored line anchor against the live file's `content_lines`,
  returning its current view and a freshness status (`:current`, `:drifted`, or
  `:outdated`). See `Suikou.Critique.Anchor.resolve/2`.

  ## Examples

      Suikou.Critique.resolve_anchor(comment.anchor, ["x", "b", "c"])
      #=> {%{start_line: 2, end_line: 2, quote: "b"}, :current}

  """
  defdelegate resolve_anchor(anchor, content_lines), to: Anchor, as: :resolve
end

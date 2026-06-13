defmodule Suikou.Critique do
  @moduledoc """
  Public API for the critique domain: human comment authoring and lifecycle,
  threaded discussion, and the cross-domain carry-forward of unresolved
  published critique when an artifact advances a round.

  This facade is the only module other layers may call; its internal submodules
  are reachable only from within the domain.
  """

  alias Suikou.Critique.Anchor
  alias Suikou.Critique.CarryForward
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
  Edits a pending comment's body. See `Suikou.Critique.Comments.edit/2`.

  ## Examples

      Suikou.Critique.edit_comment(comment.id, %{body: "revised", critique_type: :note})
      #=> {:ok, %Suikou.Schemas.Comment{body: "revised"}}

  """
  defdelegate edit_comment(comment_id, params), to: Comments, as: :edit

  @doc """
  Deletes a pending comment. See `Suikou.Critique.Comments.delete/1`.

  ## Examples

      Suikou.Critique.delete_comment(comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{}}

  """
  defdelegate delete_comment(comment_id), to: Comments, as: :delete

  @doc """
  Marks a published comment resolved. See `Suikou.Critique.Comments.resolve/1`.

  ## Examples

      Suikou.Critique.resolve_comment(comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{resolved_round: 1}}

  """
  defdelegate resolve_comment(comment_id), to: Comments, as: :resolve

  @doc """
  Reopens a resolved comment. See `Suikou.Critique.Comments.unresolve/1`.

  ## Examples

      Suikou.Critique.unresolve_comment(comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{resolved_round: nil}}

  """
  defdelegate unresolve_comment(comment_id), to: Comments, as: :unresolve

  @doc """
  Relocates a `:located` comment to a fresh line range, re-capturing its quote
  from the live file. See `Suikou.Critique.Comments.relocate/3`.

  ## Examples

      Suikou.Critique.relocate_comment(comment.id, 4, 5)
      #=> {:ok, %Suikou.Schemas.Comment{}}

  """
  defdelegate relocate_comment(comment_id, start_line, end_line), to: Comments, as: :relocate

  @doc """
  Appends a human reply to a comment thread. See
  `Suikou.Critique.Discussion.reply_as_human/2`.

  ## Examples

      Suikou.Critique.reply_as_human(comment.id, "noted")
      #=> {:ok, %Suikou.Schemas.Reply{author: :human}}

  """
  defdelegate reply_as_human(comment_id, body), to: Discussion

  @doc """
  Appends an agent reply to a comment thread. See
  `Suikou.Critique.Discussion.reply_as_agent/2`.

  ## Examples

      Suikou.Critique.reply_as_agent(comment.id, "fixed")
      #=> {:ok, %Suikou.Schemas.Reply{author: :agent}}

  """
  defdelegate reply_as_agent(comment_id, body), to: Discussion

  @doc """
  Carries `prev_round`'s unresolved published critique onto `new_round`. This is
  the cross-domain process the artifacts domain invokes when an artifact
  advances. See `Suikou.Critique.CarryForward.carry/2`.

  ## Examples

      Suikou.Critique.carry_forward(prev_round, new_round)
      #=> :ok

  """
  defdelegate carry_forward(prev_round, new_round), to: CarryForward, as: :carry

  @doc """
  Resolves a stored line anchor against the live file's `content_lines`,
  returning its current view and whether it is outdated. See
  `Suikou.Critique.Anchor.resolve/2`.

  ## Examples

      Suikou.Critique.resolve_anchor(comment.anchor, ["x", "b", "c"])
      #=> {%{start_line: 2, end_line: 2, quote: "b"}, false}

  """
  defdelegate resolve_anchor(anchor, content_lines), to: Anchor, as: :resolve
end

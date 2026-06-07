defmodule Suikou.Reviews do
  @moduledoc """
  Public API for the review loop: agent submission and round bumping, human
  critique authoring and lifecycle, batched review verdicts and approval,
  threaded discussion, agent-facing export, and round diffs.

  This facade is the only module the web layer may call; internal subdirectories
  (`schemas/`, plus the per-concern query/command modules) are reachable only
  from within this context.
  """

  alias Suikou.Reviews.Comments
  alias Suikou.Reviews.Diff
  alias Suikou.Reviews.Discussion
  alias Suikou.Reviews.Export
  alias Suikou.Reviews.Reads
  alias Suikou.Reviews.Submission
  alias Suikou.Reviews.Verdicts

  @doc """
  Submits artifact content, minting or advancing a round. See
  `Suikou.Reviews.Submission.submit/1`.

  ## Examples

      Suikou.Reviews.submit(%{title: "Draft", content: "hello\\n"})
      #=> {:ok, %{round: %Suikou.Reviews.Schemas.Round{number: 1}, bumped: true}}

  """
  defdelegate submit(attrs), to: Submission

  @doc """
  Adds a pending critique to the latest round. See
  `Suikou.Reviews.Comments.add/1`.

  ## Examples

      Suikou.Reviews.add_comment(%{round_id: round.id, scope: :review, critique_type: :note, body: "ok"})
      #=> {:ok, %Suikou.Reviews.Schemas.Comment{status: :pending}}

  """
  defdelegate add_comment(attrs), to: Comments, as: :add

  @doc """
  Edits a pending comment's body. See `Suikou.Reviews.Comments.edit/2`.

  ## Examples

      Suikou.Reviews.edit_comment(comment.id, %{body: "revised", critique_type: :note})
      #=> {:ok, %Suikou.Reviews.Schemas.Comment{body: "revised"}}

  """
  defdelegate edit_comment(comment_id, attrs), to: Comments, as: :edit

  @doc """
  Deletes a pending comment. See `Suikou.Reviews.Comments.delete/1`.

  ## Examples

      Suikou.Reviews.delete_comment(comment.id)
      #=> {:ok, %Suikou.Reviews.Schemas.Comment{}}

  """
  defdelegate delete_comment(comment_id), to: Comments, as: :delete

  @doc """
  Marks a published comment resolved. See `Suikou.Reviews.Comments.resolve/1`.

  ## Examples

      Suikou.Reviews.resolve_comment(comment.id)
      #=> {:ok, %Suikou.Reviews.Schemas.Comment{resolved_round: 1}}

  """
  defdelegate resolve_comment(comment_id), to: Comments, as: :resolve

  @doc """
  Records a verdict on the latest round. See
  `Suikou.Reviews.Verdicts.submit_review/2`.

  ## Examples

      Suikou.Reviews.submit_review(round.id, :approve)
      #=> {:ok, %{review: %Suikou.Reviews.Schemas.Review{verdict: :approve}, warnings: []}}

  """
  defdelegate submit_review(round_id, verdict), to: Verdicts

  @doc """
  Reverses approval for an artifact. See `Suikou.Reviews.Verdicts.dismiss/1`.

  ## Examples

      Suikou.Reviews.dismiss(artifact.id)
      #=> {:ok, %Suikou.Reviews.Schemas.Artifact{approved_round: nil}}

  """
  defdelegate dismiss(artifact_id), to: Verdicts

  @doc """
  Appends a human reply to a comment thread. See
  `Suikou.Reviews.Discussion.reply_as_human/2`.

  ## Examples

      Suikou.Reviews.reply_as_human(comment.id, "noted")
      #=> {:ok, %Suikou.Reviews.Schemas.Reply{author: :human}}

  """
  defdelegate reply_as_human(comment_id, body), to: Discussion

  @doc """
  Appends an agent reply to a comment thread. See
  `Suikou.Reviews.Discussion.reply_as_agent/2`.

  ## Examples

      Suikou.Reviews.reply_as_agent(comment.id, "fixed")
      #=> {:ok, %Suikou.Reviews.Schemas.Reply{author: :agent}}

  """
  defdelegate reply_as_agent(comment_id, body), to: Discussion

  @doc """
  Exports the agent-facing view of an artifact. See
  `Suikou.Reviews.Export.export/1`.

  ## Examples

      Suikou.Reviews.export(artifact.id)
      #=> {:ok, %{artifact_id: 1, round: 2, comments: []}}

  """
  defdelegate export(artifact_id), to: Export

  @doc """
  Diffs two rounds of an artifact. See `Suikou.Reviews.Diff.round_diff/3`.

  ## Examples

      Suikou.Reviews.round_diff(artifact.id, 1, 2)
      #=> {:ok, %{resolved: [], added: [], carried_forward: []}}

  """
  defdelegate round_diff(artifact_id, from_number, to_number), to: Diff

  @doc """
  Lists every artifact, newest first. See `Suikou.Reviews.Reads.list_artifacts/0`.

  ## Examples

      Suikou.Reviews.list_artifacts()
      #=> [%Suikou.Reviews.Schemas.Artifact{}]

  """
  defdelegate list_artifacts(), to: Reads

  @doc """
  Fetches an artifact by id. See `Suikou.Reviews.Reads.get_artifact/1`.

  ## Examples

      Suikou.Reviews.get_artifact(artifact.id)
      #=> %Suikou.Reviews.Schemas.Artifact{}

  """
  defdelegate get_artifact(artifact_id), to: Reads

  @doc """
  Lists an artifact's rounds, oldest first. See
  `Suikou.Reviews.Reads.list_rounds/1`.

  ## Examples

      Suikou.Reviews.list_rounds(artifact.id)
      #=> [%Suikou.Reviews.Schemas.Round{number: 1}]

  """
  defdelegate list_rounds(artifact_id), to: Reads

  @doc """
  Lists a round's comments in any status. See
  `Suikou.Reviews.Reads.list_comments/1`.

  ## Examples

      Suikou.Reviews.list_comments(round.id)
      #=> [%Suikou.Reviews.Schemas.Comment{}]

  """
  defdelegate list_comments(round_id), to: Reads

  @doc """
  Fetches a comment with its replies. See `Suikou.Reviews.Reads.get_comment/1`.

  ## Examples

      Suikou.Reviews.get_comment(comment.id)
      #=> %Suikou.Reviews.Schemas.Comment{}

  """
  defdelegate get_comment(comment_id), to: Reads
end

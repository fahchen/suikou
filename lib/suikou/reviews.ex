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

  # Agent submission / round bumping
  defdelegate submit(attrs), to: Submission

  # Human critique authoring and lifecycle
  defdelegate add_comment(attrs), to: Comments, as: :add
  defdelegate edit_comment(comment_id, attrs), to: Comments, as: :edit
  defdelegate delete_comment(comment_id), to: Comments, as: :delete
  defdelegate resolve_comment(comment_id), to: Comments, as: :resolve

  # Review verdicts / approval
  defdelegate submit_review(round_id, verdict), to: Verdicts
  defdelegate dismiss(artifact_id), to: Verdicts

  # Threaded discussion
  defdelegate reply_as_human(comment_id, body), to: Discussion
  defdelegate reply_as_agent(comment_id, body), to: Discussion

  # Agent export / round diff
  defdelegate export(artifact_id), to: Export
  defdelegate round_diff(artifact_id, from_number, to_number), to: Diff

  # Human read surface
  defdelegate list_artifacts(), to: Reads
  defdelegate get_artifact(artifact_id), to: Reads
  defdelegate list_rounds(artifact_id), to: Reads
  defdelegate list_comments(round_id), to: Reads
  defdelegate get_comment(comment_id), to: Reads
end

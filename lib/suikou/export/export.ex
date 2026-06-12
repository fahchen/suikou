defmodule Suikou.Export do
  @moduledoc """
  Read-only export of an artifact for the agent. Reflects only the latest round:
  its snapshot content, its published critique (with thread replies), and the
  artifact's standing verdict — the latest submitted round's verdict, since the
  current round is always an unsubmitted draft (see BDR-0014). Pending comments
  and earlier rounds are never included. Exporting changes no state.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Rounds
  alias Suikou.Schemas.Anchor.LineRange
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply
  alias Suikou.Schemas.Submission

  @type anchor_view :: %{
          start_line: pos_integer(),
          end_line: pos_integer(),
          quote: String.t()
        }

  @type comment_view :: %{
          id: Ecto.UUID.t(),
          scope: Comment.scope(),
          critique_type: Comment.critique_type(),
          body: String.t(),
          anchor: anchor_view() | nil,
          original_anchor: anchor_view() | nil,
          original_round: integer() | nil,
          resolved_round: integer() | nil,
          resolved: boolean(),
          outdated: boolean(),
          line_anchor: boolean(),
          replies: [%{author: Reply.author(), body: String.t()}]
        }

  @type t :: %{
          artifact_id: Ecto.UUID.t(),
          title: String.t(),
          round: integer(),
          content: String.t(),
          verdict: Submission.verdict() | nil,
          approved: boolean(),
          approved_round: integer() | nil,
          comments: [comment_view()]
        }

  @doc """
  Exports the agent-facing view of an artifact: the latest round's content, its
  published critique with replies, and the latest verdict. Changes no state.

  ## Examples

      Suikou.Export.export(artifact.id)
      #=> {:ok, %{artifact_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", round: 2, verdict: :request_changes, comments: []}}

      Suikou.Export.export("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> {:error, :artifact_not_found}

  """
  @spec export(Ecto.UUID.t()) :: {:ok, t()} | {:error, :artifact_not_found}
  def export(artifact_id) do
    case Repo.get(Artifact, artifact_id) do
      nil -> {:error, :artifact_not_found}
      %Artifact{} = artifact -> {:ok, build(artifact)}
    end
  end

  defp build(artifact) do
    round = Rounds.latest(artifact.id)

    %{
      artifact_id: artifact.id,
      title: artifact.title,
      round: round.number,
      content: round.content,
      verdict: Suikou.Submissions.latest_verdict_for_artifact(artifact.id),
      approved: not is_nil(artifact.approved_round),
      approved_round: artifact.approved_round,
      comments: published_comments(round.id)
    }
  end

  defp published_comments(round_id) do
    from(c in Comment, as: :comment)
    |> where([comment: c], c.round_id == ^round_id and c.status == :published)
    |> order_by([comment: c], asc: c.id)
    |> preload(replies: ^reply_thread())
    |> Repo.all()
    |> Enum.map(&comment_view/1)
  end

  defp reply_thread do
    order_by(from(r in Reply, as: :reply), [reply: r], asc: r.id)
  end

  defp comment_view(comment) do
    %{
      id: comment.id,
      scope: comment.scope,
      critique_type: comment.critique_type,
      body: comment.body,
      anchor: anchor_view(comment.anchor),
      original_anchor: anchor_view(comment.original_anchor),
      original_round: comment.original_round,
      resolved_round: comment.resolved_round,
      resolved: not is_nil(comment.resolved_round),
      outdated: comment.outdated,
      line_anchor: line_anchor?(comment),
      replies: Enum.map(comment.replies, &%{author: &1.author, body: &1.body})
    }
  end

  defp anchor_view(%LineRange{} = anchor) do
    %{start_line: anchor.start_line, end_line: anchor.end_line, quote: anchor.quote}
  end

  defp anchor_view(nil), do: nil

  defp line_anchor?(%Comment{scope: :line, outdated: false, anchor: %LineRange{}}), do: true
  defp line_anchor?(_comment), do: false
end

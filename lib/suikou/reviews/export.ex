defmodule Suikou.Reviews.Export do
  @moduledoc """
  Read-only export of an artifact for the agent. Reflects only the latest round:
  its snapshot content, its published critique (with thread replies), and the
  latest verdict (see BDR-0014). Pending comments and earlier rounds are never
  included. Exporting changes no state.
  """

  import Ecto.Query

  alias Suikou.Repo
  alias Suikou.Reviews.Rounds
  alias Suikou.Reviews.Schemas.Artifact
  alias Suikou.Reviews.Schemas.Comment
  alias Suikou.Reviews.Schemas.Reply
  alias Suikou.Reviews.Schemas.Review
  alias Suikou.Reviews.Verdicts

  @type comment_view :: %{
          id: integer(),
          scope: Comment.scope(),
          critique_type: Comment.critique_type(),
          body: String.t(),
          start_line: integer() | nil,
          end_line: integer() | nil,
          quote: String.t() | nil,
          resolved_round: integer() | nil,
          resolved: boolean(),
          outdated: boolean(),
          line_anchor: boolean(),
          replies: [%{author: Reply.author(), body: String.t()}]
        }

  @type t :: %{
          artifact_id: integer(),
          title: String.t(),
          round: integer(),
          content: String.t(),
          verdict: Review.verdict() | nil,
          approved: boolean(),
          approved_round: integer() | nil,
          comments: [comment_view()]
        }

  @doc """
  Exports the agent-facing view of an artifact: the latest round's content, its
  published critique with replies, and the latest verdict. Changes no state.

  ## Examples

      Suikou.Reviews.Export.export(artifact.id)
      #=> {:ok, %{artifact_id: 1, round: 2, verdict: :request_changes, comments: []}}

      Suikou.Reviews.Export.export(999_999)
      #=> {:error, :artifact_not_found}

  """
  @spec export(integer()) :: {:ok, t()} | {:error, :artifact_not_found}
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
      verdict: Verdicts.latest_verdict(round.id),
      approved: artifact.approved_round == round.number,
      approved_round: artifact.approved_round,
      comments: published_comments(round.id)
    }
  end

  defp published_comments(round_id) do
    from(c in Comment, as: :comment)
    |> where([comment: c], c.round_id == ^round_id and c.status == :published)
    |> order_by([comment: c], asc: c.id)
    |> preload(replies: ^from(r in Reply, as: :reply, order_by: r.id))
    |> Repo.all()
    |> Enum.map(&comment_view/1)
  end

  defp comment_view(comment) do
    %{
      id: comment.id,
      scope: comment.scope,
      critique_type: comment.critique_type,
      body: comment.body,
      start_line: comment.start_line,
      end_line: comment.end_line,
      quote: comment.quote,
      resolved_round: comment.resolved_round,
      resolved: not is_nil(comment.resolved_round),
      outdated: comment.outdated,
      line_anchor: line_anchor?(comment),
      replies: Enum.map(comment.replies, &%{author: &1.author, body: &1.body})
    }
  end

  defp line_anchor?(%Comment{scope: :line, outdated: false, start_line: s, end_line: e})
       when is_integer(s) and is_integer(e),
       do: true

  defp line_anchor?(_comment), do: false
end

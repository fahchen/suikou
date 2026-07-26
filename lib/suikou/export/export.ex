defmodule Suikou.Export do
  @moduledoc """
  Read-only export for the agent. Per artifact (`export/1`) it reflects the
  latest round: the published critique visible in that round (with published
  thread replies), and the artifact's standing verdict —
  the latest submitted round's verdict, since the current round is always an
  unsubmitted draft (see BDR-0014). A comment is a single row visible in round N
  when `authored_round <= N` and it is unresolved or resolved in round N or
  later, so a still-open comment shows every round until resolved without being
  copied. `export_review/2` aggregates that view across a review's minted
  artifacts for a rounds scope (`:latest` default, an inclusive `{from, to}`
  range, or `:all`), carrying the monotonic `submission_version` poll cursor.
  Pending comments and pending replies are never included; exporting changes no
  state. Each comment and published reply carries its reactions (`actor` +
  `emoji`), so the agent sees how the human (or another agent) reacted.

  Every comment, reply, and reaction names who wrote it: an `author` / `actor`
  of `%{kind, name, icon}` (see `Suikou.Critique.author_view/3`). With several agents
  reviewing one round, an agent reading this snapshot has to tell its own
  critique from a peer's before deciding what it owes a move on; `kind` alone
  cannot. The human always answers under their reserved name and carries no
  icon — their glyph is a local display preference, not review state.
  """

  import Ecto.Query

  alias Suikou.Artifacts
  alias Suikou.Critique
  alias Suikou.Critique.Queries
  alias Suikou.Reads
  alias Suikou.Repo
  alias Suikou.Rounds
  alias Suikou.Schemas.Artifact
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reaction
  alias Suikou.Schemas.Reply
  alias Suikou.Schemas.Review
  alias Suikou.Schemas.Submission
  alias Suikou.Submissions

  @typedoc """
  Which rounds an export draws published critique from: `:latest` (the standing
  round only), an inclusive round-number range `{from, to}`, or `:all`.
  """
  @type rounds_scope :: :latest | {non_neg_integer(), non_neg_integer()} | :all

  @type anchor_view :: %{
          start_line: pos_integer(),
          end_line: pos_integer(),
          quote: String.t(),
          stale: boolean()
        }

  @type reaction_view :: %{actor: Critique.author_view(), emoji: Reaction.emoji()}

  @type reply_view :: %{
          id: Ecto.UUID.t(),
          author: Critique.author_view(),
          body: String.t(),
          reactions: [reaction_view()]
        }

  @type comment_view :: %{
          id: Ecto.UUID.t(),
          scope: Comment.scope(),
          critique_type: Comment.critique_type(),
          author: Critique.author_view(),
          body: String.t(),
          anchor: anchor_view() | nil,
          resolved_round: integer() | nil,
          resolved_by: Critique.author_view() | nil,
          reactions: [reaction_view()],
          replies: [reply_view()]
        }

  @type t :: %{
          artifact_id: Ecto.UUID.t(),
          title: String.t(),
          verdict: Submission.verdict() | nil,
          comments: [comment_view()]
        }

  @type review_export :: %{
          review_id: Ecto.UUID.t(),
          submission_version: non_neg_integer(),
          artifacts: [t()]
        }

  @doc """
  Exports the agent-facing view of an artifact: its published critique with
  replies and the latest verdict. Changes no state.

  ## Examples

      Suikou.Export.export(artifact.id)
      #=> {:ok, %{artifact_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f", verdict: :request_changes, comments: []}}

      Suikou.Export.export("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> {:error, :artifact_not_found}

  """
  @spec export(Ecto.UUID.t()) :: {:ok, t()} | {:error, :artifact_not_found}
  def export(artifact_id) do
    case Repo.get(Artifact, artifact_id) do
      nil -> {:error, :artifact_not_found}
      %Artifact{} = artifact -> {:ok, build(artifact, :latest)}
    end
  end

  @doc """
  Exports the agent-facing view of a whole review: every minted (active)
  artifact's published critique for the requested rounds scope, plus the
  monotonic `submission_version` that drives the poll cursor. The default
  `:latest` scope mirrors `export/1` per artifact (the standing round's
  published critique); `{from, to}` widens it to an inclusive round-number
  range and `:all` walks every round. Changes no state.

  ## Examples

      Suikou.Export.export_review(review.id)
      #=> %{review_id: "0192…", submission_version: 2, artifacts: [%{comments: []}]}

      Suikou.Export.export_review(review.id, :all)
      #=> %{review_id: "0192…", submission_version: 2, artifacts: [%{comments: [%{body: "round 1 note"}]}]}

      Suikou.Export.export_review("0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f")
      #=> {:error, :review_not_found}

  """
  @spec export_review(Ecto.UUID.t(), rounds_scope()) ::
          review_export() | {:error, :review_not_found}
  def export_review(review_id, scope \\ :latest) do
    case Repo.get(Review, review_id) do
      nil ->
        {:error, :review_not_found}

      %Review{} = review ->
        %{
          review_id: review.id,
          submission_version: Submissions.review_submission_count(review.id),
          artifacts: Enum.map(Reads.list_review_artifacts(review.id), &build(&1, scope))
        }
    end
  end

  defp build(artifact, scope) do
    round = Rounds.latest(artifact.id)
    # Content is read only to resolve comment anchors against the live file; it
    # is not emitted — the agent already has the repo checked out.
    content = text_content(Artifacts.read_content_or_nil(artifact.id))
    lines = content && String.split(content, "\n")

    %{
      artifact_id: artifact.id,
      title: artifact.title,
      verdict: Submissions.latest_verdict_for_artifact(artifact.id),
      comments: published_comments(artifact.id, round, scope, lines)
    }
  end

  # Binary files (e.g. images) carry no scoped comments and can't be embedded in
  # the JSON snapshot — non-UTF-8 bytes would crash the encoder. Treat them as
  # having no reviewable text; the human surface previews them via the asset route.
  defp text_content(content) when is_binary(content) do
    if String.valid?(content), do: content, else: nil
  end

  defp text_content(nil), do: nil

  defp published_comments(artifact_id, latest_round, scope, lines) do
    artifact_id
    |> Queries.Comments.for_artifact()
    |> where([comment: c], c.status == :published)
    |> scope_rounds(latest_round, scope)
    |> order_by([comment: c], asc: c.id)
    |> preload(^comment_preload())
    |> Repo.all()
    |> Enum.map(&comment_view(&1, lines))
  end

  # Published replies in insertion order, each with their reactions, plus the
  # comment's own reactions. Built as a runtime value because the reply preload
  # pairs an ordering query with a nested reactions preload — a shape the
  # compile-time `preload/2` macro rejects but the runtime form accepts.
  defp comment_preload do
    [replies: {reply_thread(), reactions: reaction_order()}, reactions: reaction_order()]
  end

  defp reaction_order do
    order_by(from(r in Reaction, as: :reaction), [reaction: r], asc: r.id)
  end

  # A comment is visible in round N when it was authored on or before N and is
  # still unresolved or resolved in round N or later. `:latest` collapses the
  # range to the standing round; `{from, to}` widens it; `:all` drops the filter.
  defp scope_rounds(query, latest_round, :latest) do
    visible_in_range(query, latest_round.number, latest_round.number)
  end

  defp scope_rounds(query, _latest_round, :all), do: query

  defp scope_rounds(query, _latest_round, {from, to}) do
    visible_in_range(query, from, to)
  end

  defp visible_in_range(query, from, to) do
    where(
      query,
      [comment: c],
      c.authored_round <= ^to and (is_nil(c.resolved_round) or c.resolved_round >= ^from)
    )
  end

  defp reply_thread do
    from(r in Reply, as: :reply)
    |> where([reply: r], r.status == :published)
    |> order_by([reply: r], asc: r.id)
  end

  defp comment_view(comment, lines) do
    {anchor, status} = Critique.resolve_anchor(comment.anchor, lines)

    %{
      id: comment.id,
      scope: comment.scope,
      critique_type: comment.critique_type,
      author: Critique.author_view(comment.author, comment.author_name, comment.author_icon),
      body: comment.body,
      anchor: tag_stale(anchor, status),
      resolved_round: comment.resolved_round,
      resolved_by: resolver_view(comment),
      reactions: Enum.map(comment.reactions, &reaction_view/1),
      replies: Enum.map(comment.replies, &reply_view/1)
    }
  end

  # Rows resolved before resolution was attributed carry no answer, and an
  # unresolved comment has nobody to name.
  defp resolver_view(%Comment{resolved_by: nil}), do: nil

  defp resolver_view(%Comment{} = comment) do
    Critique.author_view(comment.resolved_by, comment.resolved_by_name || "", "")
  end

  defp reply_view(reply) do
    %{
      id: reply.id,
      author: Critique.author_view(reply.author, reply.author_name, reply.author_icon),
      body: reply.body,
      reactions: Enum.map(reply.reactions, &reaction_view/1)
    }
  end

  defp reaction_view(reaction) do
    %{
      actor: Critique.author_view(reaction.actor, reaction.actor_name, reaction.actor_icon),
      emoji: reaction.emoji
    }
  end

  # Fold staleness onto the anchor it describes: a `:located` anchor whose quote
  # no longer matches is `stale: true`, telling the agent to trust the quote, not
  # the line numbers. A `nil` anchor (review/artifact scope) carries no staleness.
  defp tag_stale(nil, _status), do: nil
  defp tag_stale(anchor, status), do: Map.put(anchor, :stale, status == :outdated)
end

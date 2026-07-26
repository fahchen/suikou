defmodule Suikou.Critique do
  @moduledoc """
  Public API for the critique domain: comment authoring and lifecycle, and
  threaded discussion, for the human reviewer and for every reviewing agent.

  Agent-facing calls take an `Suikou.Critique.Identity` built by
  `agent_identity/2`, since several agents work one review at a time and each
  writes under its own name.

  This facade is the only module other layers may call; its internal submodules
  are reachable only from within the domain.
  """

  alias Suikou.Artifacts
  alias Suikou.Critique.Anchor
  alias Suikou.Critique.Comments
  alias Suikou.Critique.Discussion
  alias Suikou.Critique.Identity
  alias Suikou.Critique.Reactions
  alias Suikou.Events
  alias Suikou.Reads
  alias Suikou.Schemas.Comment
  alias Suikou.Schemas.Reply
  alias Suikou.Schemas.Review

  @typedoc "Which kind of reviewer wrote something."
  @type author_kind() :: :human | :agent

  @typedoc "A normalized agent identity, as built by `agent_identity/2`."
  @type identity() :: Identity.t()

  @typedoc "Why a self-supplied agent name was refused."
  @type identity_error() :: Identity.error()

  @typedoc "The author shape emitted to agents and to the client."
  @type author_view() :: Identity.view()

  @doc """
  Adds a pending critique to the latest round. See
  `Suikou.Critique.Comments.add/1`.

  ## Examples

      Suikou.Critique.add_comment(%{round_id: round.id, scope: :review, critique_type: :note, body: "ok"})
      #=> {:ok, %Suikou.Schemas.Comment{status: :pending}}

  """
  @spec add_comment(map()) ::
          {:ok, Comment.t()}
          | {:error,
             Ecto.Changeset.t()
             | :round_not_found
             | :not_latest_round
             | :unknown_anchor_type
             | Artifacts.read_content_error()
             | Artifacts.content_source_error()}
  def add_comment(params), do: params |> Comments.add() |> broadcast_comment_change()

  @doc """
  Normalizes an agent's self-supplied name and icon into the identity every
  other agent-facing call takes, rejecting a missing name or the reviewer's
  reserved one. See `Suikou.Critique.Identity.agent/2`.

  ## Examples

      Suikou.Critique.agent_identity("Codex", "🤖")
      #=> {:ok, %{name: "Codex", icon: "🤖"}}

      Suikou.Critique.agent_identity(nil, nil)
      #=> {:error, :agent_name_required}

  """
  @spec agent_identity(String.t() | nil, String.t() | nil) ::
          {:ok, identity()} | {:error, Identity.error()}
  defdelegate agent_identity(name, icon), to: Identity, as: :agent

  @doc """
  Builds the author shape the export and the client render. See
  `Suikou.Critique.Identity.view/3`.

  ## Examples

      Suikou.Critique.author_view(:agent, "Codex", "🤖")
      #=> %{kind: :agent, name: "Codex", icon: "🤖"}

  """
  @spec author_view(author_kind(), String.t(), String.t()) :: author_view()
  defdelegate author_view(kind, name, icon), to: Identity, as: :view

  @doc """
  Adds an agent's critique to a review's file at `params.path`, opening the file
  if nobody has yet, published immediately. See
  `Suikou.Critique.Comments.add_as_agent/3`.

  ## Examples

      Suikou.Critique.add_comment_as_agent(review, %{path: "lib/a.ex", scope: :artifact, critique_type: :note, body: "ok"}, %{name: "Codex", icon: "🤖"})
      #=> {:ok, %Suikou.Schemas.Comment{author: :agent, status: :published}}

  """
  @spec add_comment_as_agent(Review.t(), map(), Identity.t()) ::
          {:ok, Comment.t()}
          | {:error,
             Ecto.Changeset.t()
             | :not_covered
             | :unknown_anchor_type
             | Artifacts.read_content_error()
             | Artifacts.content_source_error()}
  def add_comment_as_agent(review, params, identity),
    do: review |> Comments.add_as_agent(params, identity) |> broadcast_comment_change()

  @doc """
  Edits a Draft (pending) comment's body. See `Suikou.Critique.Comments.edit/2`.

  ## Examples

      Suikou.Critique.edit_comment(comment.id, %{body: "revised", critique_type: :note})
      #=> {:ok, %Suikou.Schemas.Comment{body: "revised"}}

  """
  @spec edit_comment(Ecto.UUID.t(), map()) ::
          {:ok, Comment.t()}
          | {:error, Ecto.Changeset.t() | :comment_not_found | :not_pending}
  def edit_comment(comment_id, params),
    do: comment_id |> Comments.edit(params) |> broadcast_comment_change()

  @doc """
  Deletes a Draft (pending) comment. See `Suikou.Critique.Comments.delete/1`.

  ## Examples

      Suikou.Critique.delete_comment(comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{}}

  """
  @spec delete_comment(Ecto.UUID.t()) :: {:ok, Comment.t()} | {:error, :comment_not_found}
  def delete_comment(comment_id),
    do: comment_id |> Comments.delete() |> broadcast_comment_change()

  @doc """
  Marks an Open comment resolved. See `Suikou.Critique.Comments.resolve/1`.

  ## Examples

      Suikou.Critique.resolve_comment(comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{resolved_round: 1}}

  """
  @spec resolve_comment(Ecto.UUID.t()) ::
          {:ok, Comment.t()} | {:error, :comment_not_found | :not_open}
  def resolve_comment(comment_id),
    do: comment_id |> Comments.resolve() |> broadcast_comment_change()

  @doc """
  Marks an Open comment resolved by an agent. See
  `Suikou.Critique.Comments.resolve_as_agent/2`.

  ## Examples

      Suikou.Critique.resolve_comment_as_agent(comment.id, %{name: "Codex", icon: "🤖"})
      #=> {:ok, %Suikou.Schemas.Comment{resolved_by: :agent, resolved_by_name: "Codex"}}

  """
  @spec resolve_comment_as_agent(Ecto.UUID.t(), identity()) ::
          {:ok, Comment.t()} | {:error, :comment_not_found | :not_open}
  def resolve_comment_as_agent(comment_id, identity),
    do: comment_id |> Comments.resolve_as_agent(identity) |> broadcast_comment_change()

  @doc """
  Reopens a Resolved comment. See `Suikou.Critique.Comments.unresolve/1`.

  ## Examples

      Suikou.Critique.unresolve_comment(comment.id)
      #=> {:ok, %Suikou.Schemas.Comment{resolved_round: nil}}

  """
  @spec unresolve_comment(Ecto.UUID.t()) ::
          {:ok, Comment.t()} | {:error, :comment_not_found | :not_resolved}
  def unresolve_comment(comment_id),
    do: comment_id |> Comments.unresolve() |> broadcast_comment_change()

  @doc """
  Relocates a `:located` comment to a fresh tagged `anchor` payload, re-capturing
  its quote from the live file. See `Suikou.Critique.Comments.relocate/2`.

  ## Examples

      Suikou.Critique.relocate_comment(comment.id, %{type: "line_range", start_line: 4, end_line: 5})
      #=> {:ok, %Suikou.Schemas.Comment{}}

  """
  @spec relocate_comment(Ecto.UUID.t(), map()) ::
          {:ok, Comment.t()}
          | {:error,
             Ecto.Changeset.t()
             | :comment_not_found
             | :not_located
             | :unknown_anchor_type
             | Artifacts.read_content_error()
             | Artifacts.content_source_error()}
  def relocate_comment(comment_id, anchor_params),
    do: comment_id |> Comments.relocate(anchor_params) |> broadcast_comment_change()

  @doc """
  Re-anchors every located comment on an artifact's latest round against the
  current file content, relocating those whose quoted lines drifted. Broadcasts
  a single review-changed event when any comment moved so subscribed clients
  re-render at the new anchors. See `Suikou.Critique.Comments.reanchor_artifact/1`.

  ## Examples

      Suikou.Critique.reanchor_artifact(artifact.id)
      #=> {:ok, 2}

  """
  @spec reanchor_artifact(Ecto.UUID.t()) ::
          {:ok, non_neg_integer()} | {:error, :artifact_not_found}
  def reanchor_artifact(artifact_id) do
    case Comments.reanchor_artifact(artifact_id) do
      {:ok, moved} = result ->
        if moved > 0, do: broadcast_artifact_change(artifact_id)
        result

      error ->
        error
    end
  end

  @doc """
  Appends a human reply to an Open or Resolved comment, auto-reopening a Resolved
  one. See `Suikou.Critique.Discussion.reply_as_human/2`.

  ## Examples

      Suikou.Critique.reply_as_human(comment.id, "noted")
      #=> {:ok, %Suikou.Schemas.Reply{author: :human, status: :pending}}

  """
  @spec reply_as_human(Ecto.UUID.t(), String.t()) ::
          {:ok, Reply.t()} | {:error, Ecto.Changeset.t() | :comment_not_found | :not_published}
  def reply_as_human(comment_id, body),
    do: comment_id |> Discussion.reply_as_human(body) |> broadcast_reply_change()

  @doc """
  Appends an agent reply to an Open comment. See
  `Suikou.Critique.Discussion.reply_as_agent/3`.

  ## Examples

      Suikou.Critique.reply_as_agent(comment.id, "fixed", %{name: "Codex", icon: "🤖"})
      #=> {:ok, %Suikou.Schemas.Reply{author: :agent, status: :published}}

  """
  @spec reply_as_agent(Ecto.UUID.t(), String.t(), Identity.t()) ::
          {:ok, Reply.t()} | {:error, Ecto.Changeset.t() | :comment_not_found | :not_open}
  def reply_as_agent(comment_id, body, identity),
    do: comment_id |> Discussion.reply_as_agent(body, identity) |> broadcast_reply_change()

  @doc """
  Edits a human's own pending reply. See `Suikou.Critique.Discussion.edit_reply/2`.

  ## Examples

      Suikou.Critique.edit_reply(reply.id, "revised")
      #=> {:ok, %Suikou.Schemas.Reply{body: "revised"}}

  """
  @spec edit_reply(Ecto.UUID.t(), String.t()) ::
          {:ok, Reply.t()} | {:error, Ecto.Changeset.t() | :reply_not_found | :not_editable}
  def edit_reply(reply_id, body),
    do: reply_id |> Discussion.edit_reply(body) |> broadcast_reply_change()

  @doc """
  Deletes a human's own pending reply. See `Suikou.Critique.Discussion.delete_reply/1`.

  ## Examples

      Suikou.Critique.delete_reply(reply.id)
      #=> {:ok, %Suikou.Schemas.Reply{}}

  """
  @spec delete_reply(Ecto.UUID.t()) ::
          {:ok, Reply.t()} | {:error, :reply_not_found | :not_editable}
  def delete_reply(reply_id),
    do: reply_id |> Discussion.delete_reply() |> broadcast_reply_change()

  @doc """
  Adds a human emoji reaction to a comment, keyed by `emoji`. See
  `Suikou.Critique.Reactions.react_as_human/2`.

  ## Examples

      Suikou.Critique.react_as_human(comment.id, "agree")
      #=> {:ok, comment.id}

  """
  @spec react_as_human(Ecto.UUID.t(), String.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :comment_not_found | Ecto.Changeset.t()}
  def react_as_human(comment_id, emoji),
    do: comment_id |> Reactions.react_as_human(emoji) |> broadcast_reaction_change()

  @doc """
  Removes a human emoji reaction from a comment, keyed by `emoji`. See
  `Suikou.Critique.Reactions.unreact_as_human/2`.

  ## Examples

      Suikou.Critique.unreact_as_human(comment.id, "agree")
      #=> {:ok, comment.id}

  """
  @spec unreact_as_human(Ecto.UUID.t(), String.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :comment_not_found}
  def unreact_as_human(comment_id, emoji),
    do: comment_id |> Reactions.unreact_as_human(emoji) |> broadcast_reaction_change()

  @doc """
  Adds an agent emoji reaction to a comment, keyed by `emoji`. See
  `Suikou.Critique.Reactions.react_as_agent/3`.

  ## Examples

      Suikou.Critique.react_as_agent(comment.id, "👀", %{name: "Codex", icon: "🤖"})
      #=> {:ok, comment.id}

  """
  @spec react_as_agent(Ecto.UUID.t(), String.t(), Identity.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :comment_not_found | Ecto.Changeset.t()}
  def react_as_agent(comment_id, emoji, identity),
    do: comment_id |> Reactions.react_as_agent(emoji, identity) |> broadcast_reaction_change()

  @doc """
  Removes an agent emoji reaction from a comment, keyed by `emoji`. See
  `Suikou.Critique.Reactions.unreact_as_agent/3`.

  ## Examples

      Suikou.Critique.unreact_as_agent(comment.id, "👀", %{name: "Codex", icon: "🤖"})
      #=> {:ok, comment.id}

  """
  @spec unreact_as_agent(Ecto.UUID.t(), String.t(), Identity.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :comment_not_found}
  def unreact_as_agent(comment_id, emoji, identity),
    do: comment_id |> Reactions.unreact_as_agent(emoji, identity) |> broadcast_reaction_change()

  @doc """
  Adds a human emoji reaction to a reply, keyed by `emoji`. See
  `Suikou.Critique.Reactions.react_reply_as_human/2`.

  ## Examples

      Suikou.Critique.react_reply_as_human(reply.id, "agree")
      #=> {:ok, reply.comment_id}

  """
  @spec react_reply_as_human(Ecto.UUID.t(), String.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :reply_not_found | Ecto.Changeset.t()}
  def react_reply_as_human(reply_id, emoji),
    do: reply_id |> Reactions.react_reply_as_human(emoji) |> broadcast_reaction_change()

  @doc """
  Removes a human emoji reaction from a reply, keyed by `emoji`. See
  `Suikou.Critique.Reactions.unreact_reply_as_human/2`.

  ## Examples

      Suikou.Critique.unreact_reply_as_human(reply.id, "agree")
      #=> {:ok, reply.comment_id}

  """
  @spec unreact_reply_as_human(Ecto.UUID.t(), String.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :reply_not_found}
  def unreact_reply_as_human(reply_id, emoji),
    do: reply_id |> Reactions.unreact_reply_as_human(emoji) |> broadcast_reaction_change()

  @doc """
  Adds an agent emoji reaction to a reply, keyed by `emoji`. See
  `Suikou.Critique.Reactions.react_reply_as_agent/3`.

  ## Examples

      Suikou.Critique.react_reply_as_agent(reply.id, "👀", %{name: "Codex", icon: "🤖"})
      #=> {:ok, reply.comment_id}

  """
  @spec react_reply_as_agent(Ecto.UUID.t(), String.t(), Identity.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :reply_not_found | Ecto.Changeset.t()}
  def react_reply_as_agent(reply_id, emoji, identity),
    do: reply_id |> Reactions.react_reply_as_agent(emoji, identity) |> broadcast_reaction_change()

  @doc """
  Removes an agent emoji reaction from a reply, keyed by `emoji`. See
  `Suikou.Critique.Reactions.unreact_reply_as_agent/3`.

  ## Examples

      Suikou.Critique.unreact_reply_as_agent(reply.id, "👀", %{name: "Codex", icon: "🤖"})
      #=> {:ok, reply.comment_id}

  """
  @spec unreact_reply_as_agent(Ecto.UUID.t(), String.t(), Identity.t()) ::
          {:ok, Ecto.UUID.t()} | {:error, :reply_not_found}
  def unreact_reply_as_agent(reply_id, emoji, identity),
    do:
      reply_id
      |> Reactions.unreact_reply_as_agent(emoji, identity)
      |> broadcast_reaction_change()

  @doc """
  Resolves a stored line anchor against the live file's `content_lines`,
  returning its current view and a freshness status (`:current`, `:drifted`, or
  `:outdated`). See `Suikou.Critique.Anchor.resolve/2`.

  ## Examples

      Suikou.Critique.resolve_anchor(comment.anchor, ["x", "b", "c"])
      #=> {%{start_line: 2, end_line: 2, quote: "b"}, :current}

  """
  defdelegate resolve_anchor(anchor, content_lines), to: Anchor, as: :resolve

  @doc """
  Returns the review's reaction change cursor. See
  `Suikou.Critique.Reactions.review_reaction_version/1`.

  ## Examples

      Suikou.Critique.review_reaction_version(review.id)
      #=> {2, ~N[2026-07-14 09:00:00]}

  """
  @spec review_reaction_version(Ecto.UUID.t()) :: {non_neg_integer(), NaiveDateTime.t() | nil}
  defdelegate review_reaction_version(review_id), to: Reactions

  defp broadcast_comment_change({:ok, %Comment{round_id: round_id}} = result) do
    {review_id, artifact_id} = Reads.scope_for_round(round_id)
    Events.review_changed(review_id, artifact_id)
    result
  end

  defp broadcast_comment_change(result), do: result

  defp broadcast_reply_change({:ok, %Reply{comment_id: comment_id}} = result) do
    {review_id, artifact_id} = Reads.scope_for_comment(comment_id)
    Events.review_changed(review_id, artifact_id)
    result
  end

  defp broadcast_reply_change(result), do: result

  defp broadcast_reaction_change({:ok, comment_id} = result) when is_binary(comment_id) do
    {review_id, artifact_id} = Reads.scope_for_comment(comment_id)
    Events.review_changed(review_id, artifact_id)
    result
  end

  defp broadcast_reaction_change(result), do: result

  defp broadcast_artifact_change(artifact_id) do
    case Reads.get_artifact(artifact_id) do
      %{review_id: review_id} when is_binary(review_id) ->
        Events.review_changed(review_id, artifact_id)

      _absent ->
        :ok
    end
  end
end

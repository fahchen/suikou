defmodule Suikou.Critique.DiscussionTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Schemas.Reply

  # The reviewing agent these cases write as; the name is required.
  @agent %{name: "Codex", icon: "\u{1F916}"}

  test "the reviewer can reply to a thread", %{comment: comment} do
    comment_id = comment.id

    assert {:ok, %{comment_id: ^comment_id, author: :human}} =
             Critique.reply_as_human(comment.id, "thanks, noted")
  end

  test "the agent can reply through the dedicated reply API", %{comment: comment} do
    comment_id = comment.id

    assert {:ok, %{comment_id: ^comment_id, author: :agent}} =
             Critique.reply_as_agent(comment.id, "fixed in next round", @agent)
  end

  test "a reply requires an existing comment so neither party can mint a top-level comment" do
    assert {:error, :comment_not_found} =
             Critique.reply_as_agent("00000000-0000-7000-8000-000000000000", "x", @agent)

    assert {:error, :comment_not_found} =
             Critique.reply_as_human("00000000-0000-7000-8000-000000000000", "x")

    assert Repo.aggregate(Reply, :count) == 0
  end

  test "an empty reply body is rejected", %{comment: comment} do
    assert {:error, %Ecto.Changeset{}} = Critique.reply_as_human(comment.id, "   ")
    assert {:error, %Ecto.Changeset{}} = Critique.reply_as_agent(comment.id, "", @agent)
  end

  test "both parties' replies attach to the same thread", %{comment: comment} do
    {:ok, _human} = Critique.reply_as_human(comment.id, "from human")
    {:ok, _agent} = Critique.reply_as_agent(comment.id, "from agent", @agent)

    authors =
      from(r in Reply, as: :reply)
      |> where([reply: r], r.comment_id == ^comment.id)
      |> order_by([reply: r], asc: r.id)
      |> select([reply: r], r.author)
      |> Repo.all()

    assert authors == [:human, :agent]
  end

  test "the reviewer can edit a pending reply", %{comment: comment} do
    {:ok, reply} = Critique.reply_as_human(comment.id, "draft")

    assert {:ok, %{body: "revised"}} = Critique.edit_reply(reply.id, "revised")
  end

  test "the reviewer can delete a pending reply", %{comment: comment} do
    {:ok, reply} = Critique.reply_as_human(comment.id, "draft")

    assert {:ok, _reply} = Critique.delete_reply(reply.id)
    assert is_nil(Repo.get(Reply, reply.id))
  end

  test "editing a published reply is rejected", %{comment: comment} do
    {:ok, reply} = Critique.reply_as_agent(comment.id, "published", @agent)

    assert {:error, :not_editable} = Critique.edit_reply(reply.id, "revised")
  end

  test "deleting an agent reply is rejected", %{comment: comment} do
    {:ok, reply} = Critique.reply_as_agent(comment.id, "published", @agent)

    assert {:error, :not_editable} = Critique.delete_reply(reply.id)
  end

  test "a named agent's reply records its name and icon", %{comment: comment} do
    assert {:ok, %Reply{author: :agent, author_name: "Codex", author_icon: "🤖"}} =
             Critique.reply_as_agent(comment.id, "on it", agent("Codex", "🤖"))
  end

  test "an agent replies to another agent's comment", %{round: round} do
    {:ok, theirs} =
      Critique.add_comment_as_agent(
        %{
          artifact_id: round.artifact_id,
          scope: :artifact,
          critique_type: :fix_required,
          body: "this leaks"
        },
        agent("Codex", "🤖")
      )

    assert {:ok, %Reply{comment_id: comment_id, author_name: "Claude"}} =
             Critique.reply_as_agent(
               theirs.id,
               "disagree",
               agent("Claude", "🪄")
             )

    assert comment_id == theirs.id
  end

  setup do
    round = insert(:round)
    comment = published_comment(round.id)
    %{comment: comment, round: round}
  end

  defp agent(name, icon) do
    {:ok, identity} = Critique.agent_identity(name, icon)
    identity
  end
end

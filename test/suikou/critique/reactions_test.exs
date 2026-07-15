defmodule Suikou.Critique.ReactionsTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Reads
  alias Suikou.Schemas.Reaction
  alias SuikouWeb.Stores.CommentRendering

  describe "react_as_human/2" do
    test "adds a reaction row", %{comment: comment} do
      comment_id = comment.id

      assert {:ok, ^comment_id} = Critique.react_as_human(comment.id, "agree")

      assert [%Reaction{emoji: :agree, actor: :human}] =
               Repo.all(Reaction)
    end

    test "reacting with the same emoji and actor leaves a single row", %{comment: comment} do
      assert {:ok, _comment_id} = Critique.react_as_human(comment.id, "agree")
      assert {:ok, _comment_id} = Critique.react_as_human(comment.id, "agree")

      assert Repo.aggregate(Reaction, :count) == 1
    end

    test "reacting with a new emoji replaces the actor's previous one", %{comment: comment} do
      assert {:ok, _comment_id} = Critique.react_as_human(comment.id, "agree")
      assert {:ok, _comment_id} = Critique.react_as_human(comment.id, "disagree")

      assert [%Reaction{emoji: :disagree, actor: :human}] =
               Repo.all(Reaction)
    end

    test "a human and an agent reaction on the same comment coexist", %{comment: comment} do
      assert {:ok, _comment_id} = Critique.react_as_human(comment.id, "agree")
      assert {:ok, _comment_id} = Critique.react_as_agent(comment.id, "eyes")

      assert Repo.aggregate(Reaction, :count) == 2
    end

    test "reacting with an agent-only emoji is rejected", %{comment: comment} do
      assert {:error, %Ecto.Changeset{}} = Critique.react_as_human(comment.id, "eyes")

      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "reacting to a missing comment is rejected" do
      assert {:error, :comment_not_found} =
               Critique.react_as_human("00000000-0000-7000-8000-000000000000", "agree")

      assert Repo.aggregate(Reaction, :count) == 0
    end
  end

  describe "unreact_as_human/2" do
    test "removes the human's reaction", %{comment: comment} do
      {:ok, _comment_id} = Critique.react_as_human(comment.id, "agree")

      comment_id = comment.id
      assert {:ok, ^comment_id} = Critique.unreact_as_human(comment.id, "agree")
      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "removes the human's reaction regardless of the emoji passed", %{comment: comment} do
      {:ok, _comment_id} = Critique.react_as_human(comment.id, "agree")

      comment_id = comment.id
      assert {:ok, ^comment_id} = Critique.unreact_as_human(comment.id, "disagree")
      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "leaves the agent's reaction on the same comment intact", %{comment: comment} do
      {:ok, _comment_id} = Critique.react_as_human(comment.id, "agree")
      {:ok, _comment_id} = Critique.react_as_agent(comment.id, "eyes")

      assert {:ok, _comment_id} = Critique.unreact_as_human(comment.id, "agree")

      assert [%Reaction{emoji: :eyes, actor: :agent}] =
               Repo.all(Reaction)
    end

    test "unreacting to a missing comment is rejected" do
      assert {:error, :comment_not_found} =
               Critique.unreact_as_human("00000000-0000-7000-8000-000000000000", "agree")
    end
  end

  describe "react_as_agent/2" do
    test "adds an agent reaction row", %{comment: comment} do
      comment_id = comment.id

      assert {:ok, ^comment_id} = Critique.react_as_agent(comment.id, "eyes")

      assert [%Reaction{emoji: :eyes, actor: :agent}] =
               Repo.all(Reaction)
    end

    test "reacting with the same emoji and actor leaves a single row", %{comment: comment} do
      assert {:ok, _comment_id} = Critique.react_as_agent(comment.id, "eyes")
      assert {:ok, _comment_id} = Critique.react_as_agent(comment.id, "eyes")

      assert Repo.aggregate(Reaction, :count) == 1
    end

    test "reacting with a new emoji replaces the actor's previous one", %{comment: comment} do
      assert {:ok, _comment_id} = Critique.react_as_agent(comment.id, "eyes")
      assert {:ok, _comment_id} = Critique.react_as_agent(comment.id, "thinking")

      assert [%Reaction{emoji: :thinking, actor: :agent}] =
               Repo.all(Reaction)
    end

    test "reacting with a human-only emoji is rejected", %{comment: comment} do
      assert {:error, %Ecto.Changeset{}} = Critique.react_as_agent(comment.id, "agree")

      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "reacting to a missing comment is rejected" do
      assert {:error, :comment_not_found} =
               Critique.react_as_agent("00000000-0000-7000-8000-000000000000", "eyes")

      assert Repo.aggregate(Reaction, :count) == 0
    end
  end

  describe "unreact_as_agent/2" do
    test "removes the matching agent reaction", %{comment: comment} do
      {:ok, _comment_id} = Critique.react_as_agent(comment.id, "eyes")

      comment_id = comment.id
      assert {:ok, ^comment_id} = Critique.unreact_as_agent(comment.id, "eyes")
      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "unreacting to a missing comment is rejected" do
      assert {:error, :comment_not_found} =
               Critique.unreact_as_agent("00000000-0000-7000-8000-000000000000", "eyes")
    end
  end

  describe "react_reply_as_human/2" do
    test "adds a reaction row targeting the reply and returns the parent comment id",
         %{comment: comment, reply: reply} do
      comment_id = comment.id

      assert {:ok, ^comment_id} = Critique.react_reply_as_human(reply.id, "agree")

      reply_id = reply.id

      assert [%Reaction{emoji: :agree, actor: :human, reply_id: ^reply_id, comment_id: nil}] =
               Repo.all(Reaction)
    end

    test "reacting with the same emoji and actor leaves a single row", %{reply: reply} do
      assert {:ok, _comment_id} = Critique.react_reply_as_human(reply.id, "agree")
      assert {:ok, _comment_id} = Critique.react_reply_as_human(reply.id, "agree")

      assert Repo.aggregate(Reaction, :count) == 1
    end

    test "reacting with a new emoji replaces the actor's previous one", %{reply: reply} do
      reply_id = reply.id

      assert {:ok, _comment_id} = Critique.react_reply_as_human(reply.id, "agree")
      assert {:ok, _comment_id} = Critique.react_reply_as_human(reply.id, "disagree")

      assert [%Reaction{emoji: :disagree, actor: :human, reply_id: ^reply_id}] =
               Repo.all(Reaction)
    end

    test "reacting to a missing reply is rejected" do
      assert {:error, :reply_not_found} =
               Critique.react_reply_as_human("00000000-0000-7000-8000-000000000000", "agree")

      assert Repo.aggregate(Reaction, :count) == 0
    end
  end

  describe "unreact_reply_as_human/2" do
    test "removes the human's reaction and returns the parent comment id",
         %{comment: comment, reply: reply} do
      {:ok, _comment_id} = Critique.react_reply_as_human(reply.id, "agree")

      comment_id = comment.id
      assert {:ok, ^comment_id} = Critique.unreact_reply_as_human(reply.id, "agree")
      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "removes the human's reaction regardless of the emoji passed", %{reply: reply} do
      {:ok, _comment_id} = Critique.react_reply_as_human(reply.id, "agree")

      assert {:ok, _comment_id} = Critique.unreact_reply_as_human(reply.id, "disagree")
      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "unreacting to a missing reply is rejected" do
      assert {:error, :reply_not_found} =
               Critique.unreact_reply_as_human("00000000-0000-7000-8000-000000000000", "agree")
    end
  end

  describe "react_reply_as_agent/2" do
    test "adds an agent reaction row targeting the reply and returns the parent comment id",
         %{comment: comment, reply: reply} do
      comment_id = comment.id

      assert {:ok, ^comment_id} = Critique.react_reply_as_agent(reply.id, "eyes")

      reply_id = reply.id

      assert [%Reaction{emoji: :eyes, actor: :agent, reply_id: ^reply_id, comment_id: nil}] =
               Repo.all(Reaction)
    end

    test "reacting with a new emoji replaces the agent's previous one", %{reply: reply} do
      reply_id = reply.id

      assert {:ok, _comment_id} = Critique.react_reply_as_agent(reply.id, "eyes")
      assert {:ok, _comment_id} = Critique.react_reply_as_agent(reply.id, "thinking")

      assert [%Reaction{emoji: :thinking, actor: :agent, reply_id: ^reply_id}] =
               Repo.all(Reaction)
    end

    test "a human-vocabulary emoji is rejected", %{reply: reply} do
      assert {:error, %Ecto.Changeset{}} = Critique.react_reply_as_agent(reply.id, "agree")
      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "reacting to a missing reply is rejected" do
      assert {:error, :reply_not_found} =
               Critique.react_reply_as_agent("00000000-0000-7000-8000-000000000000", "eyes")

      assert Repo.aggregate(Reaction, :count) == 0
    end
  end

  describe "unreact_reply_as_agent/2" do
    test "removes the agent's reaction and returns the parent comment id",
         %{comment: comment, reply: reply} do
      {:ok, _comment_id} = Critique.react_reply_as_agent(reply.id, "eyes")

      comment_id = comment.id
      assert {:ok, ^comment_id} = Critique.unreact_reply_as_agent(reply.id, "eyes")
      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "the agent and human each hold their own reaction on a reply", %{reply: reply} do
      {:ok, _comment_id} = Critique.react_reply_as_human(reply.id, "agree")
      {:ok, _comment_id} = Critique.react_reply_as_agent(reply.id, "eyes")

      assert Repo.aggregate(Reaction, :count) == 2

      assert {:ok, _comment_id} = Critique.unreact_reply_as_agent(reply.id, "eyes")

      assert [%Reaction{actor: :human, emoji: :agree}] = Repo.all(Reaction)
    end

    test "unreacting to a missing reply is rejected" do
      assert {:error, :reply_not_found} =
               Critique.unreact_reply_as_agent("00000000-0000-7000-8000-000000000000", "eyes")
    end
  end

  describe "one reaction per (target, actor) unique index" do
    test "the DB rejects a second row for the same comment and actor", %{comment: comment} do
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: :agree, actor: :human})

      assert_raise Ecto.ConstraintError, fn ->
        Repo.insert!(%Reaction{comment_id: comment.id, emoji: :disagree, actor: :human})
      end
    end

    test "the DB rejects a second row for the same reply and actor", %{reply: reply} do
      Repo.insert!(%Reaction{reply_id: reply.id, emoji: :agree, actor: :human})

      assert_raise Ecto.ConstraintError, fn ->
        Repo.insert!(%Reaction{reply_id: reply.id, emoji: :disagree, actor: :human})
      end
    end

    test "a human and an agent may each hold a reaction on the same comment",
         %{comment: comment} do
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: :agree, actor: :human})
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: :eyes, actor: :agent})

      assert Repo.aggregate(Reaction, :count) == 2
    end
  end

  describe "reaction target constraint" do
    test "a reaction may not target both a comment and a reply",
         %{comment: comment, reply: reply} do
      changeset =
        Reaction.changeset(%Reaction{actor: :human}, %{
          comment_id: comment.id,
          reply_id: reply.id,
          emoji: "agree"
        })

      refute changeset.valid?
      assert {:error, %Ecto.Changeset{}} = Repo.insert(changeset)
    end

    test "a reaction must target a comment or a reply" do
      changeset = Reaction.changeset(%Reaction{actor: :human}, %{emoji: "agree"})

      refute changeset.valid?
    end
  end

  describe "actor-scoped emoji validation" do
    test "a human reaction accepts a human emoji", %{comment: comment} do
      changeset =
        Reaction.changeset(%Reaction{actor: :human}, %{comment_id: comment.id, emoji: "agree"})

      assert changeset.valid?
    end

    test "a human reaction rejects an agent emoji", %{comment: comment} do
      changeset =
        Reaction.changeset(%Reaction{actor: :human}, %{comment_id: comment.id, emoji: "eyes"})

      refute changeset.valid?
      assert %{emoji: ["not allowed for this actor"]} = errors_on(changeset)
    end

    test "an agent reaction accepts an agent emoji", %{comment: comment} do
      changeset =
        Reaction.changeset(%Reaction{actor: :agent}, %{comment_id: comment.id, emoji: "eyes"})

      assert changeset.valid?
    end

    test "an agent reaction rejects a human emoji", %{comment: comment} do
      changeset =
        Reaction.changeset(%Reaction{actor: :agent}, %{comment_id: comment.id, emoji: "agree"})

      refute changeset.valid?
      assert %{emoji: ["not allowed for this actor"]} = errors_on(changeset)
    end
  end

  describe "render_comment/2" do
    test "renders a human chip and an agent chip as separate reactions", %{comment: comment} do
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: :agree, actor: :human})
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: :eyes, actor: :agent})

      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{
               reactions: [
                 %{emoji: :agree, count: 1, mine: true},
                 %{emoji: :eyes, count: 1, mine: false}
               ]
             } = rendered
    end

    test "marks an agent-only reaction as not mine", %{comment: comment} do
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: :eyes, actor: :agent})

      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{reactions: [%{emoji: :eyes, count: 1, mine: false}]} = rendered
    end

    test "renders an empty list when a comment has no reactions", %{comment: comment} do
      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{reactions: []} = rendered
    end

    test "aggregates each reply's reactions into per-emoji chips",
         %{comment: comment, reply: reply} do
      Repo.insert!(%Reaction{reply_id: reply.id, emoji: :agree, actor: :human})
      Repo.insert!(%Reaction{reply_id: reply.id, emoji: :eyes, actor: :agent})

      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{
               replies: [
                 %{
                   reactions: [
                     %{emoji: :agree, count: 1, mine: true},
                     %{emoji: :eyes, count: 1, mine: false}
                   ]
                 }
               ]
             } = rendered
    end
  end

  setup do
    round = insert(:round)
    comment = published_comment(round.id)
    {:ok, reply} = Critique.reply_as_agent(comment.id, "on it")
    %{comment: comment, reply: reply}
  end
end

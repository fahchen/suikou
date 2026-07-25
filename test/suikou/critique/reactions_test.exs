defmodule Suikou.Critique.ReactionsTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Reads
  alias Suikou.Schemas.Reaction
  alias SuikouWeb.Stores.CommentRendering

  # These cover the single-agent behaviour, where the caller supplies no name.
  @anonymous %{name: "", icon: ""}

  describe "react_as_human/2" do
    test "adds a reaction row", %{comment: comment} do
      comment_id = comment.id

      assert {:ok, ^comment_id} = Critique.react_as_human(comment.id, "agree")

      assert [%Reaction{emoji: "agree", actor: :human}] =
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

      assert [%Reaction{emoji: "disagree", actor: :human}] =
               Repo.all(Reaction)
    end

    test "a human and an agent reaction on the same comment coexist", %{comment: comment} do
      assert {:ok, _comment_id} = Critique.react_as_human(comment.id, "agree")
      assert {:ok, _comment_id} = Critique.react_as_agent(comment.id, "👀", @anonymous)

      assert Repo.aggregate(Reaction, :count) == 2
    end

    test "reacting with an emoji outside the human vocabulary is rejected", %{comment: comment} do
      assert {:error, %Ecto.Changeset{}} = Critique.react_as_human(comment.id, "🚀")

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
      {:ok, _comment_id} = Critique.react_as_agent(comment.id, "👀", @anonymous)

      assert {:ok, _comment_id} = Critique.unreact_as_human(comment.id, "agree")

      assert [%Reaction{emoji: "👀", actor: :agent}] =
               Repo.all(Reaction)
    end

    test "unreacting to a missing comment is rejected" do
      assert {:error, :comment_not_found} =
               Critique.unreact_as_human("00000000-0000-7000-8000-000000000000", "agree")
    end
  end

  describe "react_as_agent/3" do
    test "adds an agent reaction row", %{comment: comment} do
      comment_id = comment.id

      assert {:ok, ^comment_id} = Critique.react_as_agent(comment.id, "👀", @anonymous)

      assert [%Reaction{emoji: "👀", actor: :agent}] =
               Repo.all(Reaction)
    end

    test "accepts any emoji glyph the agent chooses", %{comment: comment} do
      assert {:ok, _comment_id} = Critique.react_as_agent(comment.id, "🚀", @anonymous)

      assert [%Reaction{emoji: "🚀", actor: :agent}] = Repo.all(Reaction)
    end

    test "reacting with the same emoji and actor leaves a single row", %{comment: comment} do
      assert {:ok, _comment_id} = Critique.react_as_agent(comment.id, "👀", @anonymous)
      assert {:ok, _comment_id} = Critique.react_as_agent(comment.id, "👀", @anonymous)

      assert Repo.aggregate(Reaction, :count) == 1
    end

    test "reacting with a new emoji replaces the actor's previous one", %{comment: comment} do
      assert {:ok, _comment_id} = Critique.react_as_agent(comment.id, "👀", @anonymous)
      assert {:ok, _comment_id} = Critique.react_as_agent(comment.id, "🤔", @anonymous)

      assert [%Reaction{emoji: "🤔", actor: :agent}] =
               Repo.all(Reaction)
    end

    test "reacting with an empty emoji is rejected", %{comment: comment} do
      assert {:error, %Ecto.Changeset{}} = Critique.react_as_agent(comment.id, "", @anonymous)

      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "reacting to a missing comment is rejected" do
      assert {:error, :comment_not_found} =
               Critique.react_as_agent("00000000-0000-7000-8000-000000000000", "👀", @anonymous)

      assert Repo.aggregate(Reaction, :count) == 0
    end
  end

  describe "unreact_as_agent/3" do
    test "removes the matching agent reaction", %{comment: comment} do
      {:ok, _comment_id} = Critique.react_as_agent(comment.id, "👀", @anonymous)

      comment_id = comment.id
      assert {:ok, ^comment_id} = Critique.unreact_as_agent(comment.id, "👀", @anonymous)
      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "unreacting to a missing comment is rejected" do
      assert {:error, :comment_not_found} =
               Critique.unreact_as_agent("00000000-0000-7000-8000-000000000000", "👀", @anonymous)
    end
  end

  describe "several agents on one target" do
    test "each named agent holds its own reaction on the same comment", %{comment: comment} do
      {:ok, _comment_id} =
        Critique.react_as_agent(comment.id, "👀", Critique.agent_identity("Codex", "🤖"))

      {:ok, _comment_id} =
        Critique.react_as_agent(comment.id, "🤔", Critique.agent_identity("Claude", "🪄"))

      assert [
               %Reaction{actor_name: "Claude", emoji: "🤔"},
               %Reaction{actor_name: "Codex", emoji: "👀"}
             ] =
               Reaction |> order_by(asc: :actor_name) |> Repo.all()
    end

    test "swapping one agent's emoji leaves the other's alone", %{comment: comment} do
      codex = Critique.agent_identity("Codex", "🤖")
      {:ok, _comment_id} = Critique.react_as_agent(comment.id, "👀", codex)

      {:ok, _comment_id} =
        Critique.react_as_agent(comment.id, "🤔", Critique.agent_identity("Claude", "🪄"))

      {:ok, _comment_id} = Critique.react_as_agent(comment.id, "✅", codex)

      assert [
               %Reaction{actor_name: "Claude", emoji: "🤔"},
               %Reaction{actor_name: "Codex", emoji: "✅"}
             ] =
               Reaction |> order_by(asc: :actor_name) |> Repo.all()
    end

    test "unreacting removes only the calling agent's row", %{comment: comment} do
      {:ok, _comment_id} =
        Critique.react_as_agent(comment.id, "👀", Critique.agent_identity("Codex", "🤖"))

      {:ok, _comment_id} =
        Critique.react_as_agent(comment.id, "🤔", Critique.agent_identity("Claude", "🪄"))

      {:ok, _comment_id} =
        Critique.unreact_as_agent(comment.id, "👀", Critique.agent_identity("Codex", "🤖"))

      assert [%Reaction{actor_name: "Claude"}] = Repo.all(Reaction)
    end

    test "a changed icon rides along when an agent swaps its emoji", %{comment: comment} do
      {:ok, _comment_id} =
        Critique.react_as_agent(comment.id, "👀", Critique.agent_identity("Codex", "🤖"))

      {:ok, _comment_id} =
        Critique.react_as_agent(comment.id, "✅", Critique.agent_identity("Codex", "🦾"))

      assert [%Reaction{emoji: "✅", actor_icon: "🦾"}] = Repo.all(Reaction)
    end

    test "each named agent holds its own reaction on the same reply", %{reply: reply} do
      {:ok, _comment_id} =
        Critique.react_reply_as_agent(reply.id, "👀", Critique.agent_identity("Codex", "🤖"))

      {:ok, _comment_id} =
        Critique.react_reply_as_agent(reply.id, "🤔", Critique.agent_identity("Claude", "🪄"))

      assert Repo.aggregate(Reaction, :count) == 2
    end
  end

  describe "react_reply_as_human/2" do
    test "adds a reaction row targeting the reply and returns the parent comment id",
         %{comment: comment, reply: reply} do
      comment_id = comment.id

      assert {:ok, ^comment_id} = Critique.react_reply_as_human(reply.id, "agree")

      reply_id = reply.id

      assert [%Reaction{emoji: "agree", actor: :human, reply_id: ^reply_id, comment_id: nil}] =
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

      assert [%Reaction{emoji: "disagree", actor: :human, reply_id: ^reply_id}] =
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

  describe "react_reply_as_agent/3" do
    test "adds an agent reaction row targeting the reply and returns the parent comment id",
         %{comment: comment, reply: reply} do
      comment_id = comment.id

      assert {:ok, ^comment_id} = Critique.react_reply_as_agent(reply.id, "👀", @anonymous)

      reply_id = reply.id

      assert [%Reaction{emoji: "👀", actor: :agent, reply_id: ^reply_id, comment_id: nil}] =
               Repo.all(Reaction)
    end

    test "reacting with a new emoji replaces the agent's previous one", %{reply: reply} do
      reply_id = reply.id

      assert {:ok, _comment_id} = Critique.react_reply_as_agent(reply.id, "👀", @anonymous)
      assert {:ok, _comment_id} = Critique.react_reply_as_agent(reply.id, "🤔", @anonymous)

      assert [%Reaction{emoji: "🤔", actor: :agent, reply_id: ^reply_id}] =
               Repo.all(Reaction)
    end

    test "an empty emoji is rejected", %{reply: reply} do
      assert {:error, %Ecto.Changeset{}} = Critique.react_reply_as_agent(reply.id, "", @anonymous)
      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "reacting to a missing reply is rejected" do
      assert {:error, :reply_not_found} =
               Critique.react_reply_as_agent(
                 "00000000-0000-7000-8000-000000000000",
                 "👀",
                 @anonymous
               )

      assert Repo.aggregate(Reaction, :count) == 0
    end
  end

  describe "unreact_reply_as_agent/3" do
    test "removes the agent's reaction and returns the parent comment id",
         %{comment: comment, reply: reply} do
      {:ok, _comment_id} = Critique.react_reply_as_agent(reply.id, "👀", @anonymous)

      comment_id = comment.id
      assert {:ok, ^comment_id} = Critique.unreact_reply_as_agent(reply.id, "👀", @anonymous)
      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "the agent and human each hold their own reaction on a reply", %{reply: reply} do
      {:ok, _comment_id} = Critique.react_reply_as_human(reply.id, "agree")
      {:ok, _comment_id} = Critique.react_reply_as_agent(reply.id, "👀", @anonymous)

      assert Repo.aggregate(Reaction, :count) == 2

      assert {:ok, _comment_id} = Critique.unreact_reply_as_agent(reply.id, "👀", @anonymous)

      assert [%Reaction{actor: :human, emoji: "agree"}] = Repo.all(Reaction)
    end

    test "unreacting to a missing reply is rejected" do
      assert {:error, :reply_not_found} =
               Critique.unreact_reply_as_agent(
                 "00000000-0000-7000-8000-000000000000",
                 "👀",
                 @anonymous
               )
    end
  end

  describe "one reaction per (target, actor) unique index" do
    test "the DB rejects a second row for the same comment and actor", %{comment: comment} do
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: "agree", actor: :human})

      assert_raise Ecto.ConstraintError, fn ->
        Repo.insert!(%Reaction{comment_id: comment.id, emoji: "disagree", actor: :human})
      end
    end

    test "the DB rejects a second row for the same reply and actor", %{reply: reply} do
      Repo.insert!(%Reaction{reply_id: reply.id, emoji: "agree", actor: :human})

      assert_raise Ecto.ConstraintError, fn ->
        Repo.insert!(%Reaction{reply_id: reply.id, emoji: "disagree", actor: :human})
      end
    end

    test "a human and an agent may each hold a reaction on the same comment",
         %{comment: comment} do
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: "agree", actor: :human})
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: "👀", actor: :agent})

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
    test "a human reaction accepts a human key", %{comment: comment} do
      changeset =
        Reaction.changeset(%Reaction{actor: :human}, %{comment_id: comment.id, emoji: "agree"})

      assert changeset.valid?
    end

    test "a human reaction rejects a non-human emoji", %{comment: comment} do
      changeset =
        Reaction.changeset(%Reaction{actor: :human}, %{comment_id: comment.id, emoji: "🚀"})

      refute changeset.valid?
      assert %{emoji: ["not allowed for this actor"]} = errors_on(changeset)
    end

    test "an agent reaction accepts any glyph", %{comment: comment} do
      changeset =
        Reaction.changeset(%Reaction{actor: :agent}, %{comment_id: comment.id, emoji: "🚀"})

      assert changeset.valid?
    end

    test "an agent reaction rejects an empty emoji", %{comment: comment} do
      changeset =
        Reaction.changeset(%Reaction{actor: :agent}, %{comment_id: comment.id, emoji: ""})

      refute changeset.valid?
    end
  end

  describe "render_comment/2" do
    test "renders a human chip and an agent chip as separate reactions", %{comment: comment} do
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: "agree", actor: :human})
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: "👀", actor: :agent})

      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{
               reactions: [
                 %{emoji: "agree", actor: :human, count: 1, mine: true},
                 %{emoji: "👀", actor: :agent, count: 1, mine: false}
               ]
             } = rendered
    end

    test "marks an agent reaction as not mine", %{comment: comment} do
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: "👀", actor: :agent})

      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{reactions: [%{emoji: "👀", actor: :agent, count: 1, mine: false}]} = rendered
    end

    test "renders an empty list when a comment has no reactions", %{comment: comment} do
      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{reactions: []} = rendered
    end

    test "one chip names every agent behind its count", %{comment: comment} do
      {:ok, _comment_id} =
        Critique.react_as_agent(comment.id, "👀", Critique.agent_identity("Codex", "🤖"))

      {:ok, _comment_id} =
        Critique.react_as_agent(comment.id, "👀", Critique.agent_identity("Claude", "🪄"))

      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{reactions: [%{emoji: "👀", count: 2, by: by}]} = rendered
      assert Enum.sort(Enum.map(by, & &1.name)) == ["Claude", "Codex"]
    end

    test "an anonymous reactor contributes no name to the chip", %{comment: comment} do
      {:ok, _comment_id} = Critique.react_as_agent(comment.id, "👀", @anonymous)
      {:ok, _comment_id} = Critique.react_as_human(comment.id, "agree")

      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{reactions: [%{emoji: "agree", by: []}, %{emoji: "👀", by: []}]} = rendered
    end

    test "a comment and its replies carry their author identity", %{comment: comment} do
      {:ok, _reply} =
        Critique.reply_as_agent(comment.id, "on it", Critique.agent_identity("Codex", "🤖"))

      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{author: %{kind: :human, name: nil, icon: nil}, replies: replies} = rendered

      assert %{author: %{kind: :agent, name: "Codex", icon: "🤖"}} = List.last(replies)
    end

    test "aggregates each reply's reactions into per-emoji chips",
         %{comment: comment, reply: reply} do
      Repo.insert!(%Reaction{reply_id: reply.id, emoji: "agree", actor: :human})
      Repo.insert!(%Reaction{reply_id: reply.id, emoji: "👀", actor: :agent})

      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{
               replies: [
                 %{
                   reactions: [
                     %{emoji: "agree", actor: :human, count: 1, mine: true},
                     %{emoji: "👀", actor: :agent, count: 1, mine: false}
                   ]
                 }
               ]
             } = rendered
    end
  end

  setup do
    round = insert(:round)
    comment = published_comment(round.id)
    {:ok, reply} = Critique.reply_as_agent(comment.id, "on it", @anonymous)
    %{comment: comment, reply: reply}
  end
end

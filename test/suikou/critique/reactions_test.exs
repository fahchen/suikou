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

      assert {:ok, ^comment_id} = Critique.react_as_human(comment.id, "thumbs_up")

      assert [%Reaction{emoji: :thumbs_up, actor: :human}] =
               Repo.all(from(r in Reaction, as: :reaction))
    end

    test "reacting with the same emoji and actor is idempotent", %{comment: comment} do
      assert {:ok, _} = Critique.react_as_human(comment.id, "thumbs_up")
      assert {:ok, _} = Critique.react_as_human(comment.id, "thumbs_up")

      assert Repo.aggregate(Reaction, :count) == 1
    end

    test "reacting to a missing comment is rejected" do
      assert {:error, :comment_not_found} =
               Critique.react_as_human("00000000-0000-7000-8000-000000000000", "thumbs_up")

      assert Repo.aggregate(Reaction, :count) == 0
    end
  end

  describe "unreact_as_human/2" do
    test "removes the matching human reaction", %{comment: comment} do
      {:ok, _} = Critique.react_as_human(comment.id, "thumbs_up")

      comment_id = comment.id
      assert {:ok, ^comment_id} = Critique.unreact_as_human(comment.id, "thumbs_up")
      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "unreacting to a missing comment is rejected" do
      assert {:error, :comment_not_found} =
               Critique.unreact_as_human("00000000-0000-7000-8000-000000000000", "thumbs_up")
    end
  end

  describe "react_reply_as_human/2" do
    test "adds a reaction row targeting the reply and returns the parent comment id",
         %{comment: comment, reply: reply} do
      comment_id = comment.id

      assert {:ok, ^comment_id} = Critique.react_reply_as_human(reply.id, "thumbs_up")

      reply_id = reply.id

      assert [%Reaction{emoji: :thumbs_up, actor: :human, reply_id: ^reply_id, comment_id: nil}] =
               Repo.all(from(r in Reaction, as: :reaction))
    end

    test "reacting with the same emoji and actor is idempotent", %{reply: reply} do
      assert {:ok, _} = Critique.react_reply_as_human(reply.id, "thumbs_up")
      assert {:ok, _} = Critique.react_reply_as_human(reply.id, "thumbs_up")

      assert Repo.aggregate(Reaction, :count) == 1
    end

    test "reacting to a missing reply is rejected" do
      assert {:error, :reply_not_found} =
               Critique.react_reply_as_human("00000000-0000-7000-8000-000000000000", "thumbs_up")

      assert Repo.aggregate(Reaction, :count) == 0
    end
  end

  describe "unreact_reply_as_human/2" do
    test "removes the matching human reaction and returns the parent comment id",
         %{comment: comment, reply: reply} do
      {:ok, _} = Critique.react_reply_as_human(reply.id, "thumbs_up")

      comment_id = comment.id
      assert {:ok, ^comment_id} = Critique.unreact_reply_as_human(reply.id, "thumbs_up")
      assert Repo.aggregate(Reaction, :count) == 0
    end

    test "unreacting to a missing reply is rejected" do
      assert {:error, :reply_not_found} =
               Critique.unreact_reply_as_human("00000000-0000-7000-8000-000000000000", "thumbs_up")
    end
  end

  describe "reaction target constraint" do
    test "a reaction may not target both a comment and a reply",
         %{comment: comment, reply: reply} do
      changeset =
        Reaction.changeset(%Reaction{actor: :human}, %{
          comment_id: comment.id,
          reply_id: reply.id,
          emoji: "thumbs_up"
        })

      refute changeset.valid?
      assert {:error, %Ecto.Changeset{}} = Repo.insert(changeset)
    end

    test "a reaction must target a comment or a reply" do
      changeset = Reaction.changeset(%Reaction{actor: :human}, %{emoji: "thumbs_up"})

      refute changeset.valid?
    end
  end

  describe "render_comment/2" do
    test "aggregates counts and marks the human's own reaction as mine", %{comment: comment} do
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: :thumbs_up, actor: :human})
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: :thumbs_up, actor: :agent})
      Repo.insert!(%Reaction{comment_id: comment.id, emoji: :eyes, actor: :agent})

      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{
               reactions: [
                 %{emoji: :thumbs_up, count: 2, mine: true},
                 %{emoji: :eyes, count: 1, mine: false}
               ]
             } = rendered
    end

    test "renders an empty list when a comment has no reactions", %{comment: comment} do
      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{reactions: []} = rendered
    end

    test "aggregates each reply's reactions into per-emoji chips",
         %{comment: comment, reply: reply} do
      Repo.insert!(%Reaction{reply_id: reply.id, emoji: :thumbs_up, actor: :human})
      Repo.insert!(%Reaction{reply_id: reply.id, emoji: :thumbs_up, actor: :agent})
      Repo.insert!(%Reaction{reply_id: reply.id, emoji: :eyes, actor: :agent})

      rendered = comment.id |> Reads.get_comment() |> CommentRendering.render_comment(nil)

      assert %{
               replies: [
                 %{
                   reactions: [
                     %{emoji: :thumbs_up, count: 2, mine: true},
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

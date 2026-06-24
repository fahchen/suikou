defmodule Suikou.ReadsTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Reads

  doctest Suikou.Reads, import: true

  describe "list_artifacts/0" do
    test "returns every artifact, newest first" do
      a = insert(:artifact, title: "first")
      b = insert(:artifact, title: "second")

      ids = Enum.map(Reads.list_artifacts(), & &1.id)
      assert ids == [b.id, a.id]
    end

    test "is empty when nothing was submitted" do
      assert Reads.list_artifacts() == []
    end
  end

  describe "get_artifact/1" do
    test "returns the artifact by id" do
      artifact = insert(:round).artifact
      artifact_id = artifact.id
      assert %{id: ^artifact_id} = Reads.get_artifact(artifact.id)
    end

    test "returns nil for an unknown id" do
      assert is_nil(Reads.get_artifact("00000000-0000-7000-8000-000000000000"))
    end
  end

  describe "list_rounds/1" do
    test "returns rounds in ascending number order" do
      artifact = insert(:round).artifact
      advance(artifact.id, "v2\n")
      advance(artifact.id, "v3\n")

      numbers = artifact.id |> Reads.list_rounds() |> Enum.map(& &1.number)
      assert numbers == [0, 1, 2]
    end
  end

  describe "list_comments/1" do
    test "returns pending and published comments with replies, oldest first" do
      round = insert(:round)
      published = published_comment(round.id, %{body: "published"})
      pending = pending_comment(round.id, %{body: "pending"})
      {:ok, _reply} = Critique.reply_as_human(published.id, "noted")

      comments = Reads.list_comments(round)
      assert Enum.map(comments, & &1.id) == [published.id, pending.id]

      statuses = Enum.map(comments, & &1.status)
      assert :pending in statuses
      assert :published in statuses

      published_view = Enum.find(comments, &(&1.id == published.id))
      assert Enum.map(published_view.replies, & &1.body) == ["noted"]
    end

    test "returns an empty list for a round with no comments" do
      round = insert(:round)
      assert Reads.list_comments(round) == []
    end
  end

  describe "get_comment/1" do
    test "returns a comment with its thread replies in order" do
      round = insert(:round)
      comment = published_comment(round.id)
      {:ok, _h} = Critique.reply_as_human(comment.id, "human")
      {:ok, _a} = Critique.reply_as_agent(comment.id, "agent")

      comment_id = comment.id
      loaded = Reads.get_comment(comment.id)
      assert %{id: ^comment_id} = loaded
      assert Enum.map(loaded.replies, & &1.author) == [:human, :agent]
    end

    test "returns nil for an unknown id" do
      assert is_nil(Reads.get_comment("00000000-0000-7000-8000-000000000000"))
    end
  end
end

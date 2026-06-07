defmodule Suikou.Reviews.ReadsTest do
  use Suikou.DataCase

  import Suikou.ReviewsFixtures

  alias Suikou.Reviews

  describe "list_artifacts/0" do
    test "returns every artifact, newest first" do
      %{artifact: a} = artifact_fixture(title: "first")
      %{artifact: b} = artifact_fixture(title: "second")

      ids = Enum.map(Reviews.list_artifacts(), & &1.id)
      assert ids == [b.id, a.id]
    end

    test "is empty when nothing was submitted" do
      assert Reviews.list_artifacts() == []
    end
  end

  describe "get_artifact/1" do
    test "returns the artifact by id" do
      %{artifact: artifact} = artifact_fixture()
      artifact_id = artifact.id
      assert %{id: ^artifact_id} = Reviews.get_artifact(artifact.id)
    end

    test "returns nil for an unknown id" do
      assert is_nil(Reviews.get_artifact(999_999))
    end
  end

  describe "list_rounds/1" do
    test "returns rounds in ascending number order" do
      %{artifact: artifact} = artifact_fixture()
      advance(artifact.id, "v2\n")
      advance(artifact.id, "v3\n")

      numbers = artifact.id |> Reviews.list_rounds() |> Enum.map(& &1.number)
      assert numbers == [1, 2, 3]
    end
  end

  describe "list_comments/1" do
    test "returns pending and published comments with replies, oldest first" do
      %{round: round} = artifact_fixture()
      published = published_comment(round.id, %{body: "published"})
      pending = pending_comment(round.id, %{body: "pending"})
      {:ok, _reply} = Reviews.reply_as_human(published.id, "noted")

      comments = Reviews.list_comments(round.id)
      assert Enum.map(comments, & &1.id) == [published.id, pending.id]

      statuses = Enum.map(comments, & &1.status)
      assert :pending in statuses
      assert :published in statuses

      published_view = Enum.find(comments, &(&1.id == published.id))
      assert Enum.map(published_view.replies, & &1.body) == ["noted"]
    end

    test "returns an empty list for a round with no comments" do
      %{round: round} = artifact_fixture()
      assert Reviews.list_comments(round.id) == []
    end
  end

  describe "get_comment/1" do
    test "returns a comment with its thread replies in order" do
      %{round: round} = artifact_fixture()
      comment = published_comment(round.id)
      {:ok, _h} = Reviews.reply_as_human(comment.id, "human")
      {:ok, _a} = Reviews.reply_as_agent(comment.id, "agent")

      comment_id = comment.id
      loaded = Reviews.get_comment(comment.id)
      assert %{id: ^comment_id} = loaded
      assert Enum.map(loaded.replies, & &1.author) == [:human, :agent]
    end

    test "returns nil for an unknown id" do
      assert is_nil(Reviews.get_comment(999_999))
    end
  end
end

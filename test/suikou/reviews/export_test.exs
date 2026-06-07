defmodule Suikou.Reviews.ExportTest do
  use Suikou.DataCase

  import Suikou.ReviewsFixtures

  alias Suikou.Reviews

  test "published comments on the latest round are exported, resolved and open alike" do
    %{artifact: artifact, round: round} = artifact_fixture()
    open = published_comment(round.id, %{body: "open one"})
    resolved = published_comment(round.id, %{body: "resolved one"})
    {:ok, _resolved} = Reviews.resolve_comment(resolved.id)

    assert {:ok, export} = Reviews.export(artifact.id)
    ids = Enum.map(export.comments, & &1.id)
    assert open.id in ids
    assert resolved.id in ids
    assert Enum.any?(export.comments, & &1.resolved)
    assert Enum.any?(export.comments, &(not &1.resolved))
  end

  test "pending comments are never exported" do
    %{artifact: artifact, round: round} = artifact_fixture()
    pending_comment(round.id)

    assert {:ok, %{comments: []}} = Reviews.export(artifact.id)
  end

  test "only the latest round's critique is exported" do
    %{artifact: artifact, round: round1} = artifact_fixture()
    published_comment(round1.id, %{body: "round 1 critique"})
    round1_comment_id = artifact.id |> latest_comment_ids() |> hd()
    {:ok, _resolved} = Reviews.resolve_comment(round1_comment_id)
    %{round: round2} = advance(artifact.id, "changed\n")
    published_comment(round2.id, %{body: "round 2 critique"})

    assert {:ok, export} = Reviews.export(artifact.id)
    assert %{round: 2} = export
    assert Enum.all?(export.comments, &(&1.body == "round 2 critique"))
  end

  test "the latest snapshot content travels with the critique" do
    %{artifact: artifact} = artifact_fixture(content: "snapshot body\n")
    assert {:ok, %{content: "snapshot body\n"}} = Reviews.export(artifact.id)
  end

  test "an approved artifact reports its approval and verdict" do
    %{artifact: artifact} = artifact_fixture()
    %{round: round2} = advance(artifact.id, "v2\n")
    {:ok, _review} = Reviews.submit_review(round2.id, :approve)

    assert {:ok, %{verdict: :approve, approved: true, approved_round: 2}} =
             Reviews.export(artifact.id)
  end

  test "a request_changes verdict reports not approved" do
    %{artifact: artifact, round: round} = artifact_fixture()
    {:ok, _review} = Reviews.submit_review(round.id, :request_changes)

    assert {:ok, %{verdict: :request_changes, approved: false}} = Reviews.export(artifact.id)
  end

  test "a comment's replies travel with it" do
    %{artifact: artifact, round: round} = artifact_fixture()
    comment = published_comment(round.id)
    {:ok, _human} = Reviews.reply_as_human(comment.id, "human reply")
    {:ok, _agent} = Reviews.reply_as_agent(comment.id, "agent reply")

    assert {:ok, export} = Reviews.export(artifact.id)
    view = Enum.find(export.comments, &(&1.id == comment.id))
    assert Enum.map(view.replies, & &1.author) == [:human, :agent]
  end

  test "a carried-forward outdated comment exports flagged with no valid anchor" do
    %{artifact: artifact, round: round} =
      artifact_fixture(content: "intro\nrate limit is 100 rps\n")

    published_comment(round.id, %{
      scope: :line,
      start_line: 2,
      end_line: 2,
      critique_type: :fix_required
    })

    advance(artifact.id, "wholly\ndifferent\n")

    assert {:ok, export} = Reviews.export(artifact.id)
    [view] = export.comments
    assert view.outdated
    refute view.line_anchor
  end

  test "exporting twice changes no state and is stable" do
    %{artifact: artifact, round: round} = artifact_fixture()
    published_comment(round.id)

    assert {:ok, first} = Reviews.export(artifact.id)
    assert {:ok, second} = Reviews.export(artifact.id)
    assert first == second
  end

  test "an artifact with no reviews exports a nil verdict and not approved" do
    %{artifact: artifact} = artifact_fixture()
    assert {:ok, %{verdict: nil, approved: false, comments: []}} = Reviews.export(artifact.id)
  end

  test "an unknown artifact id returns an error" do
    assert {:error, :artifact_not_found} = Reviews.export(999_999)
  end

  defp latest_comment_ids(artifact_id) do
    {:ok, export} = Reviews.export(artifact_id)
    Enum.map(export.comments, & &1.id)
  end
end

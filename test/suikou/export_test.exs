defmodule Suikou.ExportTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Export
  alias Suikou.Submissions

  test "published comments on the latest round are exported, resolved and open alike" do
    round = insert(:round)
    artifact = round.artifact
    open = published_comment(round.id, %{body: "open one"})
    resolved = published_comment(round.id, %{body: "resolved one"})
    {:ok, _resolved} = Critique.resolve_comment(resolved.id)

    assert {:ok, export} = Export.export(artifact.id)
    ids = Enum.map(export.comments, & &1.id)
    assert open.id in ids
    assert resolved.id in ids
    assert Enum.any?(export.comments, & &1.resolved)
    assert Enum.any?(export.comments, &(not &1.resolved))
  end

  test "pending comments are never exported" do
    round = insert(:round)
    artifact = round.artifact
    pending_comment(round.id)

    assert {:ok, %{comments: []}} = Export.export(artifact.id)
  end

  test "only the latest round's critique is exported" do
    round1 = insert(:round)
    artifact = round1.artifact
    published_comment(round1.id, %{body: "round 1 critique"})
    round1_comment_id = artifact.id |> latest_comment_ids() |> hd()
    {:ok, _resolved} = Critique.resolve_comment(round1_comment_id)
    %{round: round2} = advance(artifact.id, "changed\n")
    published_comment(round2.id, %{body: "round 2 critique"})

    assert {:ok, export} = Export.export(artifact.id)
    assert %{round: 1} = export
    assert Enum.all?(export.comments, &(&1.body == "round 2 critique"))
  end

  test "the latest snapshot content travels with the critique" do
    artifact = source_round("snapshot body\n").artifact
    assert {:ok, %{content: "snapshot body\n"}} = Export.export(artifact.id)
  end

  test "an approved artifact reports its approval and verdict" do
    artifact = insert(:round).artifact
    %{round: round2} = advance(artifact.id, "v2\n")
    {:ok, _submission} = Submissions.submit(round2.id, :approve)

    assert {:ok, %{verdict: :approve, approved: true, approved_round: 1}} =
             Export.export(artifact.id)
  end

  test "a request_changes verdict reports not approved" do
    round = insert(:round)
    artifact = round.artifact
    {:ok, _submission} = Submissions.submit(round.id, :request_changes)

    assert {:ok, %{verdict: :request_changes, approved: false}} = Export.export(artifact.id)
  end

  test "a comment's replies travel with it" do
    round = insert(:round)
    artifact = round.artifact
    comment = published_comment(round.id)
    {:ok, _human} = Critique.reply_as_human(comment.id, "human reply")
    {:ok, _agent} = Critique.reply_as_agent(comment.id, "agent reply")

    assert {:ok, export} = Export.export(artifact.id)
    view = Enum.find(export.comments, &(&1.id == comment.id))
    assert Enum.map(view.replies, & &1.author) == [:human, :agent]
  end

  test "a carried-forward outdated comment exports flagged with no valid anchor" do
    round = source_round("intro\nrate limit is 100 rps\n")
    artifact = round.artifact

    published_comment(round.id, %{
      scope: :located,
      start_line: 2,
      end_line: 2,
      critique_type: :fix_required
    })

    advance(artifact.id, "wholly\ndifferent\n")

    assert {:ok, export} = Export.export(artifact.id)
    [view] = export.comments
    assert view.outdated
    refute view.line_anchor
  end

  test "exporting twice changes no state and is stable" do
    round = insert(:round)
    artifact = round.artifact
    published_comment(round.id)

    assert {:ok, first} = Export.export(artifact.id)
    assert {:ok, second} = Export.export(artifact.id)
    assert first == second
  end

  test "an artifact with no reviews exports a nil verdict and not approved" do
    artifact = insert(:round).artifact
    assert {:ok, %{verdict: nil, approved: false, comments: []}} = Export.export(artifact.id)
  end

  test "an unknown artifact id returns an error" do
    assert {:error, :artifact_not_found} = Export.export("00000000-0000-7000-8000-000000000000")
  end

  describe "export_review/2" do
    test "default :latest scope yields each artifact's standing-round critique" do
      # Resolve the round-0 note before advancing so it is not carried forward,
      # isolating the latest round's own critique.
      review = insert(:review)
      round = round_in_review(review)
      note0 = published_comment(round.id, %{body: "round 0 note"})
      {:ok, _resolved} = Critique.resolve_comment(note0.id)
      %{round: round2} = advance(round.artifact_id, "changed\n")
      published_comment(round2.id, %{body: "round 1 note"})

      assert %{review_id: review_id, submission_version: 1, artifacts: [artifact]} =
               Export.export_review(review.id)

      assert review_id == review.id
      assert %{round: 1} = artifact
      assert Enum.map(artifact.comments, & &1.body) == ["round 1 note"]
    end

    test "a round range gathers published critique across the selected rounds" do
      review = insert(:review)
      round = round_in_review(review)
      note0 = published_comment(round.id, %{body: "round 0 note"})
      {:ok, _resolved} = Critique.resolve_comment(note0.id)
      %{round: round2} = advance(round.artifact_id, "v2\n")
      note1 = published_comment(round2.id, %{body: "round 1 note"})
      {:ok, _resolved} = Critique.resolve_comment(note1.id)
      %{round: round3} = advance(round.artifact_id, "v3\n")
      published_comment(round3.id, %{body: "round 2 note"})

      assert %{artifacts: [artifact]} = Export.export_review(review.id, {0, 1})
      assert Enum.sort(Enum.map(artifact.comments, & &1.body)) == ["round 0 note", "round 1 note"]
    end

    test ":all scope gathers published critique from every round" do
      review = insert(:review)
      round = round_in_review(review)
      note0 = published_comment(round.id, %{body: "round 0 note"})
      {:ok, _resolved} = Critique.resolve_comment(note0.id)
      %{round: round2} = advance(round.artifact_id, "v2\n")
      published_comment(round2.id, %{body: "round 1 note"})

      assert %{artifacts: [artifact]} = Export.export_review(review.id, :all)
      assert Enum.sort(Enum.map(artifact.comments, & &1.body)) == ["round 0 note", "round 1 note"]
    end

    test "every minted artifact of the review is aggregated" do
      review = insert(:review)
      a1 = round_in_review(review)
      a2 = round_in_review(review)
      published_comment(a1.id, %{body: "first"})
      published_comment(a2.id, %{body: "second"})

      assert %{artifacts: artifacts} = Export.export_review(review.id, :all)
      bodies = artifacts |> Enum.flat_map(& &1.comments) |> Enum.map(& &1.body)
      assert Enum.sort(bodies) == ["first", "second"]
    end

    test "an unknown review id returns an error" do
      assert {:error, :review_not_found} =
               Export.export_review("00000000-0000-7000-8000-000000000000")
    end
  end

  defp latest_comment_ids(artifact_id) do
    {:ok, export} = Export.export(artifact_id)
    Enum.map(export.comments, & &1.id)
  end
end

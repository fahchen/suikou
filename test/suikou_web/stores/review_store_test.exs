defmodule SuikouWeb.Stores.ReviewStoreTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Musubi.Testing
  alias Suikou.Reads
  alias Suikou.Submissions
  alias SuikouWeb.Stores.ReviewStore

  describe "diff child" do
    test "renders no diff child until a round pair is selected" do
      artifact = insert(:round).artifact
      page = Testing.mount(ReviewStore, %{"artifact_id" => artifact.id})

      assert %{diff: nil} = Testing.render(page)
    end

    test "renders the text, transitions, and verdict change for the selected rounds" do
      round1 = insert(:round, content: "alpha\nbeta\n")
      artifact = round1.artifact
      {:ok, %{next_round: round2}} = Submissions.submit(round1.id, :request_changes)
      edit_round(artifact.id, "alpha\ngamma\n")
      {:ok, _r2} = Submissions.submit(round2.id, :approve)

      page = Testing.mount(ReviewStore, %{"artifact_id" => artifact.id})
      {:ok, _reply} = Testing.dispatch_command(page, :diff_round, %{from: 0, to: 1})

      assert %{
               from: 0,
               to: 1,
               text: text,
               verdict_from: :request_changes,
               verdict_to: :approve
             } = Testing.render(page, ["diff"])

      deleted = for %{op: :del, value: value} <- text, into: "", do: value
      inserted = for %{op: :ins, value: value} <- text, into: "", do: value
      assert deleted =~ "bet"
      assert inserted =~ "mma"
    end

    test "close_diff unmounts the diff child" do
      artifact = insert(:round).artifact
      advance(artifact.id, "changed\n")
      page = Testing.mount(ReviewStore, %{"artifact_id" => artifact.id})

      {:ok, _reply} = Testing.dispatch_command(page, :diff_round, %{from: 0, to: 1})
      assert %{from: 0} = Testing.render(page, ["diff"])

      {:ok, _reply} = Testing.dispatch_command(page, :close_diff, %{})
      assert %{diff: nil} = Testing.render(page)
    end
  end

  describe "draft verdict" do
    test "mount renders the latest round's stored draft verdict" do
      round = insert(:round)
      {:ok, _round} = Submissions.set_draft_verdict(round.id, :approve)
      page = Testing.mount(ReviewStore, %{"artifact_id" => round.artifact_id})

      assert %{draft_verdict: :approve} = Testing.render(page)
    end

    test "set_draft_verdict persists the choice onto the latest round" do
      artifact = insert(:round).artifact
      page = Testing.mount(ReviewStore, %{"artifact_id" => artifact.id})

      {:ok, _reply} =
        Testing.dispatch_command(page, :set_draft_verdict, %{verdict: :request_changes})

      assert %{draft_verdict: :request_changes} = Testing.render(page)
    end
  end

  describe "comments child" do
    test "mount renders pre-existing comments without a command" do
      round = insert(:round)
      published_comment(round.id, %{scope: :review, critique_type: :note, body: "existing"})
      page = Testing.mount(ReviewStore, %{"artifact_id" => round.artifact_id})

      assert %{items: [%{body: "existing"}]} = Testing.render(page, ["comments"])
    end

    test "add_comment renders a pending draft comment in the child" do
      artifact = insert(:round).artifact
      page = Testing.mount(ReviewStore, %{"artifact_id" => artifact.id})

      {:ok, _reply} =
        Testing.dispatch_command(
          page,
          :add_comment,
          %{
            scope: :line,
            critique_type: :fix_required,
            body: "tighten this",
            start_line: 1,
            end_line: 1
          },
          ["comments"]
        )

      assert %{items: [%{body: "tighten this", status: :pending, scope: :line}]} =
               Testing.render(page, ["comments"])
    end

    test "resolve_comment marks a published comment resolved" do
      round = insert(:round)

      published_comment(round.id, %{
        scope: :line,
        critique_type: :fix_required,
        body: "x",
        start_line: 1,
        end_line: 1
      })

      [comment] = Reads.list_comments(round.id)
      page = Testing.mount(ReviewStore, %{"artifact_id" => round.artifact_id})

      {:ok, _reply} =
        Testing.dispatch_command(page, :resolve_comment, %{comment_id: comment.id}, ["comments"])

      assert %{items: [%{resolved: true}]} = Testing.render(page, ["comments"])
    end

    test "unresolve_comment reopens a resolved comment" do
      round = insert(:round)

      published_comment(round.id, %{
        scope: :line,
        critique_type: :fix_required,
        body: "x",
        start_line: 1,
        end_line: 1
      })

      [comment] = Reads.list_comments(round.id)
      page = Testing.mount(ReviewStore, %{"artifact_id" => round.artifact_id})

      {:ok, _reply} =
        Testing.dispatch_command(page, :resolve_comment, %{comment_id: comment.id}, ["comments"])

      {:ok, _reply} =
        Testing.dispatch_command(page, :unresolve_comment, %{comment_id: comment.id}, ["comments"])

      assert %{items: [%{resolved: false}]} = Testing.render(page, ["comments"])
    end

    test "reply appends a human reply to the thread" do
      round = insert(:round)
      published_comment(round.id, %{scope: :review, critique_type: :note, body: "q"})
      [comment] = Reads.list_comments(round.id)
      page = Testing.mount(ReviewStore, %{"artifact_id" => round.artifact_id})

      {:ok, _reply} =
        Testing.dispatch_command(
          page,
          :reply,
          %{comment_id: comment.id, body: "answer"},
          ["comments"]
        )

      assert %{items: [%{replies: [%{author: :human, body: "answer"}]}]} =
               Testing.render(page, ["comments"])
    end

    test "delete_comment removes it from the child render" do
      round = insert(:round)
      pending_comment(round.id, %{scope: :review, critique_type: :note, body: "drop me"})
      [comment] = Reads.list_comments(round.id)
      page = Testing.mount(ReviewStore, %{"artifact_id" => round.artifact_id})

      {:ok, _reply} =
        Testing.dispatch_command(page, :delete_comment, %{comment_id: comment.id}, ["comments"])

      assert %{items: []} = Testing.render(page, ["comments"])
    end

    test "relocate_comment re-anchors an outdated carried comment and clears the flag" do
      round1 = insert(:round, content: "alpha\nbeta\ngamma\n")
      artifact = round1.artifact

      published_comment(round1.id, %{
        scope: :line,
        critique_type: :needs_answer,
        body: "what about beta?",
        start_line: 2,
        end_line: 2
      })

      %{round: round2} = advance(artifact.id, "alpha\nDELTA\ngamma\nbeta\n")
      [carried] = Reads.list_comments(round2.id)
      assert carried.outdated

      page = Testing.mount(ReviewStore, %{"artifact_id" => artifact.id})

      {:ok, _reply} =
        Testing.dispatch_command(
          page,
          :relocate_comment,
          %{comment_id: carried.id, start_line: 4, end_line: 4},
          ["comments"]
        )

      assert %{items: [%{outdated: false, anchor: %{start_line: 4, end_line: 4}}]} =
               Testing.render(page, ["comments"])
    end
  end
end

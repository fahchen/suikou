defmodule SuikouWeb.Stores.ReviewStoreTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Musubi.Testing
  alias Suikou.Reads
  alias Suikou.Submissions
  alias SuikouWeb.Stores.ReviewStore

  describe "missing artifact" do
    test "renders an empty snapshot instead of crashing when the artifact is gone" do
      page =
        Testing.mount(ReviewStore, %{"artifact_id" => "00000000-0000-7000-8000-000000000000"})

      assert %{artifact: %{id: ""}, rounds: [], current_round: %{number: 0}} =
               Testing.render(page)
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
      artifact = source_round("line 1\nline 2\nline 3\n").artifact
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
      round = source_round("line 1\nline 2\nline 3\n")

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
      round = source_round("line 1\nline 2\nline 3\n")

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

    test "relocate_comment re-pins a comment whose quote is gone and renders it located" do
      round1 = source_round("alpha\nbeta\ngamma\n")
      artifact = round1.artifact

      published_comment(round1.id, %{
        scope: :line,
        critique_type: :needs_answer,
        body: "what about beta?",
        start_line: 2,
        end_line: 2
      })

      # The quoted "beta" no longer appears, so the carried comment can't be
      # located and renders outdated until it is manually re-pinned.
      %{round: round2} = advance(artifact.id, "alpha\nDELTA\ngamma\nEPSILON\n")
      [carried] = Reads.list_comments(round2.id)

      page = Testing.mount(ReviewStore, %{"artifact_id" => artifact.id})
      assert %{items: [%{outdated: true}]} = Testing.render(page, ["comments"])

      {:ok, _reply} =
        Testing.dispatch_command(
          page,
          :relocate_comment,
          %{comment_id: carried.id, start_line: 4, end_line: 4},
          ["comments"]
        )

      assert %{
               items: [
                 %{outdated: false, anchor: %{start_line: 4, end_line: 4, quote: "EPSILON"}}
               ]
             } =
               Testing.render(page, ["comments"])
    end

    test "a line comment re-resolves to its quote's current line after the file changes" do
      round = source_round("alpha\nbeta\ngamma\n")

      published_comment(round.id, %{
        scope: :line,
        critique_type: :note,
        body: "re: beta",
        start_line: 2,
        end_line: 2
      })

      rewrite_source(round.artifact_id, "added\nalpha\nbeta\ngamma\n")
      page = Testing.mount(ReviewStore, %{"artifact_id" => round.artifact_id})

      assert %{items: [%{outdated: false, anchor: %{start_line: 3, end_line: 3, quote: "beta"}}]} =
               Testing.render(page, ["comments"])
    end

    test "a line comment renders outdated when its quote no longer appears" do
      round = source_round("alpha\nbeta\ngamma\n")

      published_comment(round.id, %{
        scope: :line,
        critique_type: :note,
        body: "re: beta",
        start_line: 2,
        end_line: 2
      })

      rewrite_source(round.artifact_id, "wholly\ndifferent\n")
      page = Testing.mount(ReviewStore, %{"artifact_id" => round.artifact_id})

      assert %{items: [%{outdated: true}]} = Testing.render(page, ["comments"])
    end
  end
end

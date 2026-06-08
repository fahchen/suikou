defmodule SuikouWeb.Stores.ReviewStoreTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Musubi.Testing
  alias Suikou.Reads
  alias Suikou.Review
  alias SuikouWeb.Stores.ReviewStore

  describe "diff_round / close_diff" do
    test "renders no diff until a round pair is selected" do
      artifact = insert(:round).artifact
      page = Testing.mount(ReviewStore, %{"artifact_id" => artifact.id})

      assert %{diff: nil} = Testing.render(page)
    end

    test "renders the text, transitions, and verdict change for the selected rounds" do
      round1 = insert(:round, content: "alpha\nbeta\n")
      artifact = round1.artifact
      {:ok, %{next_round: round2}} = Review.submit_review(round1.id, :request_changes)
      edit_round(artifact.id, "alpha\ngamma\n")
      {:ok, _r2} = Review.submit_review(round2.id, :approve)

      page = Testing.mount(ReviewStore, %{"artifact_id" => artifact.id})
      {:ok, _reply} = Testing.dispatch_command(page, :diff_round, %{from: 0, to: 1})

      assert %{
               diff: %{
                 from: 0,
                 to: 1,
                 text: text,
                 verdict_from: :request_changes,
                 verdict_to: :approve
               }
             } = Testing.render(page)

      deleted = for %{op: :del, value: value} <- text, into: "", do: value
      inserted = for %{op: :ins, value: value} <- text, into: "", do: value
      assert deleted =~ "bet"
      assert inserted =~ "mma"
    end

    test "close_diff clears the rendered diff" do
      artifact = insert(:round).artifact
      advance(artifact.id, "changed\n")
      page = Testing.mount(ReviewStore, %{"artifact_id" => artifact.id})

      {:ok, _reply} = Testing.dispatch_command(page, :diff_round, %{from: 0, to: 1})
      assert %{diff: %{from: 0}} = Testing.render(page)

      {:ok, _reply} = Testing.dispatch_command(page, :close_diff, %{})
      assert %{diff: nil} = Testing.render(page)
    end
  end

  describe "relocate_comment" do
    test "re-anchors an outdated carried comment and clears the flag" do
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
        Testing.dispatch_command(page, :relocate_comment, %{
          comment_id: carried.id,
          start_line: 4,
          end_line: 4
        })

      assert %{comments: [%{outdated: false, anchor: %{start_line: 4, end_line: 4}}]} =
               Testing.render(page)
    end
  end
end

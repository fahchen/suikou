defmodule SuikouWeb.Stores.ReviewStoreTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Musubi.Socket
  alias Musubi.Testing
  alias Suikou.Reads
  alias Suikou.Schemas.Artifact
  alias Suikou.Submissions
  alias SuikouWeb.Stores.CommentBroadcast
  alias SuikouWeb.Stores.ReviewStore

  describe "submit wake broadcast" do
    test "submitting via the command broadcasts :comments_changed on the review topic" do
      round = insert(:round)
      %Artifact{review_id: review_id} = Reads.get_artifact(round.artifact_id)
      CommentBroadcast.subscribe(review_id)

      page = Testing.mount(ReviewStore, %{"artifact_id" => round.artifact_id})

      {:ok, _reply} = Testing.dispatch_command(page, :submit_review, %{verdict: :comment})

      assert_receive :comments_changed
    end
  end

  describe "comments child fan-out on :comments_changed" do
    # `Musubi.send_update/2` sends to `self()`; invoking the callback directly
    # from the test process makes `self()` the test, so the fan-out message
    # lands in this mailbox.
    test "handle_info(:comments_changed) pushes a reload_token to the comments child" do
      artifact = insert(:round).artifact
      socket = %Socket{assigns: %{artifact_id: artifact.id}}

      {:noreply, %Socket{}} = ReviewStore.handle_info(:comments_changed, socket)

      assert_receive {:musubi_send_update, ["comments"], %{reload_token: token}}
      assert is_integer(token)
    end
  end

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
            scope: :located,
            critique_type: :fix_required,
            body: "tighten this",
            anchor: %{type: :line_range, start_line: 1, end_line: 1}
          },
          ["comments"]
        )

      assert %{items: [%{body: "tighten this", status: :pending, scope: :located}]} =
               Testing.render(page, ["comments"])
    end

    test "resolve_comment marks a published comment resolved" do
      round = source_round("line 1\nline 2\nline 3\n")

      published_comment(round.id, %{
        scope: :located,
        critique_type: :fix_required,
        body: "x",
        start_line: 1,
        end_line: 1
      })

      [comment] = Reads.list_comments(round)
      page = Testing.mount(ReviewStore, %{"artifact_id" => round.artifact_id})

      {:ok, _reply} =
        Testing.dispatch_command(page, :resolve_comment, %{comment_id: comment.id}, ["comments"])

      assert %{items: [%{resolved: true}]} = Testing.render(page, ["comments"])
    end

    test "replying to a resolved comment reopens it" do
      round = source_round("line 1\nline 2\nline 3\n")

      published_comment(round.id, %{
        scope: :located,
        critique_type: :fix_required,
        body: "x",
        start_line: 1,
        end_line: 1
      })

      [comment] = Reads.list_comments(round)
      page = Testing.mount(ReviewStore, %{"artifact_id" => round.artifact_id})

      {:ok, _reply} =
        Testing.dispatch_command(page, :resolve_comment, %{comment_id: comment.id}, ["comments"])

      {:ok, _reply} =
        Testing.dispatch_command(
          page,
          :reply,
          %{comment_id: comment.id, body: "actually still broken"},
          ["comments"]
        )

      assert %{items: [%{resolved: false}]} = Testing.render(page, ["comments"])
    end

    test "reply appends a human reply to the thread" do
      round = insert(:round)
      published_comment(round.id, %{scope: :review, critique_type: :note, body: "q"})
      [comment] = Reads.list_comments(round)
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
      [comment] = Reads.list_comments(round)
      page = Testing.mount(ReviewStore, %{"artifact_id" => round.artifact_id})

      {:ok, _reply} =
        Testing.dispatch_command(page, :delete_comment, %{comment_id: comment.id}, ["comments"])

      assert %{items: []} = Testing.render(page, ["comments"])
    end

    test "relocate_comment re-pins a comment whose quote is gone and renders it located" do
      round1 = source_round("alpha\nbeta\ngamma\n")
      artifact = round1.artifact

      published_comment(round1.id, %{
        scope: :located,
        critique_type: :needs_answer,
        body: "what about beta?",
        start_line: 2,
        end_line: 2
      })

      # The quoted "beta" no longer appears, so the carried comment can't be
      # located and renders outdated until it is manually re-pinned.
      %{round: round2} = advance(artifact.id, "alpha\nDELTA\ngamma\nEPSILON\n")
      [carried] = Reads.list_comments(round2)

      page = Testing.mount(ReviewStore, %{"artifact_id" => artifact.id})
      assert %{items: [%{outdated: true}]} = Testing.render(page, ["comments"])

      {:ok, _reply} =
        Testing.dispatch_command(
          page,
          :relocate_comment,
          %{
            comment_id: carried.id,
            anchor: %{type: :line_range, start_line: 4, end_line: 4}
          },
          ["comments"]
        )

      assert %{
               items: [
                 %{
                   outdated: false,
                   anchor: %{type: :line_range, start_line: 4, end_line: 4, quote: "EPSILON"}
                 }
               ]
             } =
               Testing.render(page, ["comments"])
    end

    test "a line comment re-resolves to its quote's current line after the file changes" do
      round = source_round("alpha\nbeta\ngamma\n")

      published_comment(round.id, %{
        scope: :located,
        critique_type: :note,
        body: "re: beta",
        start_line: 2,
        end_line: 2
      })

      rewrite_source(round.artifact_id, "added\nalpha\nbeta\ngamma\n")
      page = Testing.mount(ReviewStore, %{"artifact_id" => round.artifact_id})

      assert %{
               items: [
                 %{
                   outdated: false,
                   anchor: %{type: :line_range, start_line: 3, end_line: 3, quote: "beta"}
                 }
               ]
             } =
               Testing.render(page, ["comments"])
    end

    test "a line comment renders outdated when its quote no longer appears" do
      round = source_round("alpha\nbeta\ngamma\n")

      published_comment(round.id, %{
        scope: :located,
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

  describe "files_comments fan-out" do
    setup do
      review = insert(:review)
      one = round_in_review(review)
      two = round_in_review(review)
      write_source(one.artifact_id, "alpha\nbeta\n")
      write_source(two.artifact_id, "one\ntwo\n")

      published_comment(one.id, %{
        scope: :located,
        critique_type: :note,
        body: "on file one",
        start_line: 1,
        end_line: 1
      })

      published_comment(two.id, %{
        scope: :located,
        critique_type: :note,
        body: "on file two",
        start_line: 2,
        end_line: 2
      })

      page = Testing.mount(ReviewStore, %{"artifact_id" => one.artifact_id})
      %{page: page, review: review, one: one, two: two}
    end

    test "renders a per-file thread for every minted artifact", %{page: page, one: one, two: two} do
      snapshot = Testing.render(page)
      assert is_list(snapshot.files_comments)

      one_thread = Enum.find(snapshot.files_comments, &(&1.artifact_id == one.artifact_id))
      two_thread = Enum.find(snapshot.files_comments, &(&1.artifact_id == two.artifact_id))

      assert %{items: [%{body: "on file one"}]} = one_thread
      assert %{items: [%{body: "on file two"}]} = two_thread
    end

    test "scopes comments to the right file's anchor line", %{page: page, one: one} do
      snapshot = Testing.render(page)
      one_thread = Enum.find(snapshot.files_comments, &(&1.artifact_id == one.artifact_id))
      assert [%{anchor: %{start_line: 1, quote: "alpha"}}] = one_thread.items
    end

    # All-files mode reads the parent fan-out, not the child thread, so a
    # resolve dispatched to the `comments` child must still surface live there.
    # The child broadcasts `:comments_changed`; the root's `handle_info/2`
    # dirties an assign so the next render recomputes the fan-out.
    test "a child resolve refreshes the parent files_comments fan-out", %{page: page, one: one} do
      [comment] = Reads.list_comments(one)

      {:ok, _reply} =
        Testing.dispatch_command(page, :resolve_comment, %{comment_id: comment.id}, ["comments"])

      snapshot = Testing.render(page)
      one_thread = Enum.find(snapshot.files_comments, &(&1.artifact_id == one.artifact_id))
      assert %{items: [%{resolved: true}]} = one_thread
    end
  end

  describe "add_file_comment" do
    setup do
      # Drive add_file_comment against a real on-disk file-selection review so
      # `Reviews.open_file/2` can mint round 0 for the targeted path.
      tmp =
        Path.join(
          System.tmp_dir!(),
          "suikou-add-file-comment-#{System.unique_integer([:positive])}"
        )

      File.mkdir_p!(tmp)
      File.write!(Path.join(tmp, "first.md"), "one\ntwo\n")
      File.write!(Path.join(tmp, "second.md"), "alpha\nbeta\n")
      on_exit(fn -> File.rm_rf!(tmp) end)

      project = insert(:project, path: tmp)

      {:ok, review} =
        Suikou.Reviews.create_review(project, %{
          name: "rv",
          selections: ["first.md", "second.md"]
        })

      {:ok, first} = Suikou.Reviews.open_file(review, "first.md")
      page = Testing.mount(ReviewStore, %{"artifact_id" => first.id})
      %{page: page, review: review, first: first}
    end

    test "writes a comment against an already-minted file", %{page: page, first: first} do
      {:ok, %{artifact_id: artifact_id, error: nil}} =
        Testing.dispatch_command(page, :add_file_comment, %{
          path: "first.md",
          scope: :located,
          critique_type: :note,
          body: "on first",
          anchor: %{type: :line_range, start_line: 1, end_line: 1}
        })

      assert artifact_id == first.id

      snapshot = Testing.render(page)
      thread = Enum.find(snapshot.files_comments, &(&1.artifact_id == first.id))
      assert %{items: [%{body: "on first"}]} = thread
    end

    test "mints the artifact when commenting on an unvisited file", %{page: page, review: review} do
      {:ok, %{artifact_id: minted_id, error: nil}} =
        Testing.dispatch_command(page, :add_file_comment, %{
          path: "second.md",
          scope: :located,
          critique_type: :note,
          body: "on second",
          anchor: %{type: :line_range, start_line: 1, end_line: 1}
        })

      assert is_binary(minted_id)
      refute minted_id == review.id

      snapshot = Testing.render(page)
      thread = Enum.find(snapshot.files_comments, &(&1.artifact_id == minted_id))
      assert %{path: "second.md", items: [%{body: "on second"}]} = thread

      # `files` async should also surface the freshly minted artifact_id for
      # the row whose path is now wired up.
      assert %{result: files} = snapshot.files
      second_row = Enum.find(files, &(&1.path == "second.md"))
      assert second_row.artifact_id == minted_id
    end

    test "rejects a path not covered by the review", %{page: page} do
      {:ok, %{artifact_id: nil, error: "not_covered"}} =
        Testing.dispatch_command(page, :add_file_comment, %{
          path: "not/in/review.md",
          scope: :located,
          critique_type: :note,
          body: "x",
          anchor: nil
        })
    end
  end

  defp write_source(artifact_id, content) do
    artifact =
      Suikou.Schemas.Artifact
      |> Suikou.Repo.get!(artifact_id)
      |> Suikou.Repo.preload(review: :project)

    path = Path.join(artifact.review.project.path, artifact.file_path)
    File.mkdir_p!(Path.dirname(path))
    File.write!(path, content)
  end
end

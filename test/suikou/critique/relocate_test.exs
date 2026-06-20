defmodule Suikou.Critique.RelocateTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Reads

  test "relocate re-captures the quote at fresh lines from the live file" do
    round1 = source_round("alpha\nbeta\ngamma\n")
    artifact = round1.artifact

    published_comment(round1.id, %{
      scope: :located,
      critique_type: :needs_answer,
      body: "what about beta?",
      start_line: 2,
      end_line: 2
    })

    # The quoted "beta" is gone; the human re-pins the comment to a fresh line,
    # which re-captures the quote there from the current file.
    %{round: round2} = advance(artifact.id, "alpha\nDELTA\ngamma\nEPSILON\n")
    [comment] = Reads.list_comments(round2)

    assert {:ok, relocated} =
             Critique.relocate_comment(comment.id, %{
               type: "line_range",
               start_line: 4,
               end_line: 4
             })

    assert %{start_line: 4, end_line: 4, quote: "EPSILON"} = relocated.anchor
  end

  test "relocate rejects a comment with no line anchor" do
    round = insert(:round)
    comment = published_comment(round.id, %{scope: :review, body: "no anchor"})

    assert {:error, :not_located} =
             Critique.relocate_comment(comment.id, %{
               type: "line_range",
               start_line: 1,
               end_line: 1
             })
  end

  test "relocate returns an error for an unknown comment" do
    assert {:error, :comment_not_found} =
             Critique.relocate_comment(Ecto.UUID.generate(), %{
               type: "line_range",
               start_line: 1,
               end_line: 1
             })
  end
end

defmodule Suikou.Critique.RelocateTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Reads

  test "relocate re-anchors an outdated carried comment and clears the flag" do
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

    assert {:ok, relocated} = Critique.relocate_comment(carried.id, 4, 4)
    refute relocated.outdated
    assert %{start_line: 4, end_line: 4, quote: "beta"} = relocated.anchor
  end

  test "relocate rejects a comment with no line anchor" do
    round = insert(:round)
    comment = published_comment(round.id, %{scope: :review, body: "no anchor"})

    assert {:error, :not_line_scoped} = Critique.relocate_comment(comment.id, 1, 1)
  end

  test "relocate returns an error for an unknown comment" do
    assert {:error, :comment_not_found} = Critique.relocate_comment(Ecto.UUID.generate(), 1, 1)
  end
end

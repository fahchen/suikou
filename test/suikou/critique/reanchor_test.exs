defmodule Suikou.Critique.ReanchorTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Reads

  test "reanchor follows a comment whose quoted line moved" do
    round1 = source_round("alpha\nbeta\ngamma\n")
    artifact = round1.artifact

    published_comment(round1.id, %{
      scope: :located,
      critique_type: :needs_answer,
      body: "what about beta?",
      start_line: 2,
      end_line: 2
    })

    # A line is prepended, so "beta" now sits on line 3. The stored anchor still
    # points at line 2 until the automatic re-anchor moves it.
    %{round: round2} = advance(artifact.id, "inserted\nalpha\nbeta\ngamma\n")

    assert {:ok, 1} = Critique.reanchor_artifact(artifact.id)

    [comment] = Reads.list_comments(round2)
    assert %{start_line: 3, end_line: 3, quote: "beta"} = comment.anchor
  end

  test "reanchor leaves an unchanged comment untouched" do
    round1 = source_round("alpha\nbeta\ngamma\n")
    artifact = round1.artifact

    published_comment(round1.id, %{
      scope: :located,
      critique_type: :note,
      body: "beta note",
      start_line: 2,
      end_line: 2
    })

    assert {:ok, 0} = Critique.reanchor_artifact(artifact.id)
  end

  test "reanchor returns an error for an unknown artifact" do
    assert {:error, :artifact_not_found} = Critique.reanchor_artifact(Ecto.UUID.generate())
  end
end

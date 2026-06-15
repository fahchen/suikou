defmodule Suikou.Critique.ElementAuthoringTest do
  use Suikou.DataCase

  import Suikou.Factory

  alias Suikou.Critique
  alias Suikou.Schemas.Anchor.Element

  describe "add_comment with an element anchor" do
    test "stores the client-supplied selector and quote verbatim" do
      round = insert(:round)

      assert {:ok, comment} =
               Critique.add_comment(%{
                 round_id: round.id,
                 scope: :located,
                 anchor: %{
                   type: "element",
                   selector: "main > p:nth-of-type(2)",
                   quote: "Hello world"
                 },
                 critique_type: :note,
                 body: "tighten this copy"
               })

      assert %{
               anchor: %Element{
                 selector: "main > p:nth-of-type(2)",
                 quote: "Hello world"
               }
             } = comment
    end

    test "does not read the artifact content for an element anchor" do
      # `insert(:round)` produces a round on an artifact whose backing file has
      # never been written to disk. A `line_range` anchor on the same round
      # would error in `Artifacts.read_content/1`; an element anchor must not
      # touch it at all (see BDR-0021).
      round = insert(:round)

      assert {:ok, _comment} =
               Critique.add_comment(%{
                 round_id: round.id,
                 scope: :located,
                 anchor: %{type: "element", selector: "h1", quote: "Title"},
                 critique_type: :note,
                 body: "x"
               })
    end

    test "relocate_comment re-stores a fresh selector + quote verbatim" do
      round = insert(:round)

      {:ok, comment} =
        Critique.add_comment(%{
          round_id: round.id,
          scope: :located,
          anchor: %{type: "element", selector: "h1", quote: "Old"},
          critique_type: :note,
          body: "x"
        })

      assert {:ok, relocated} =
               Critique.relocate_comment(comment.id, %{
                 type: "element",
                 selector: "main h1",
                 quote: "New"
               })

      assert %{anchor: %Element{selector: "main h1", quote: "New"}} = relocated
    end
  end
end

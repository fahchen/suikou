defmodule SuikouWeb.AgentCLITest do
  use ExUnit.Case, async: true

  alias SuikouWeb.AgentCLI

  describe "identity/1" do
    test "reads the calling agent's name and optional icon off the payload" do
      assert AgentCLI.identity(%{"as" => "Codex", "icon" => "🤖"}) ==
               {:ok, %{name: "Codex", icon: "🤖"}}
    end
  end

  describe "error/1" do
    test "renders an atom reason as its string form" do
      assert AgentCLI.error(:review_not_found) == "review_not_found"
    end

    test "renders a reason carrying paths with the paths listed" do
      assert "stack_not_equivalent: a.txt, lib/b.ex" =
               AgentCLI.error({:stack_not_equivalent, ["a.txt", "lib/b.ex"]})
    end

    test "renders a base mismatch with both short merge-bases" do
      source = String.duplicate("a", 40)
      stack = String.duplicate("b", 40)

      assert "stack_base_mismatch: the source forks at aaaaaaa, the stack at bbbbbbb" =
               AgentCLI.error({:stack_base_mismatch, source, stack})

      assert "stack_base_mismatch: the source forks at aaaaaaa, the stack shares no history" =
               AgentCLI.error({:stack_base_mismatch, source, nil})
    end

    test "renders a changeset as comma-joined field messages" do
      changeset =
        %Suikou.Schemas.Project{}
        |> Ecto.Changeset.change()
        |> Ecto.Changeset.add_error(:name, "can't be blank")

      assert AgentCLI.error(changeset) == "name can't be blank"
    end

    test "reaches into an embed, which holds a comment anchor's errors" do
      changeset =
        Suikou.Schemas.Comment.author_changeset(%Suikou.Schemas.Comment{author: :human}, %{
          round_id: "0192c9f4-7e3a-7b3a-8c3a-1a2b3c4d5e6f",
          scope: :located,
          critique_type: :note,
          body: "x",
          authored_round: 0,
          anchor: %{__type__: "line_range", start_line: 0, end_line: 0, quote: ""}
        })

      refute changeset.valid?
      # The comment itself is fine, so a top-level-only read would say nothing at
      # all and the agent would get an empty error string.
      assert changeset.errors == []
      assert AgentCLI.error(changeset) =~ "anchor.start_line must be greater than 0"
    end

    test "interpolates a message's options rather than leaking the template" do
      changeset =
        %Suikou.Schemas.Project{}
        |> Ecto.Changeset.change(%{name: "x"})
        |> Ecto.Changeset.validate_length(:name, min: 3)

      assert AgentCLI.error(changeset) == "name should be at least 3 character(s)"
    end
  end
end

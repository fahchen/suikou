defmodule SuikouWeb.AgentCLITest do
  use ExUnit.Case, async: true

  import ExUnit.CaptureIO

  alias SuikouWeb.AgentCLI

  describe "read_payload/0" do
    test "decodes the stdin JSON into a string-keyed map" do
      payload =
        capture_io([input: Jason.encode!(%{"review_id" => "0192"})], fn ->
          send(self(), AgentCLI.read_payload())
        end)

      assert payload == ""
      assert_received %{"review_id" => "0192"}
    end
  end

  describe "emit/1" do
    test "writes the map as one JSON line to stdout" do
      out = capture_io(fn -> AgentCLI.emit(%{review_id: "0192"}) end)

      assert %{"review_id" => "0192"} = Jason.decode!(out)
    end
  end

  describe "error/1" do
    test "renders an atom reason as its string form" do
      assert AgentCLI.error(:review_not_found) == "review_not_found"
    end

    test "renders a changeset as comma-joined field messages" do
      changeset =
        %Suikou.Schemas.Project{}
        |> Ecto.Changeset.change()
        |> Ecto.Changeset.add_error(:name, "can't be blank")

      assert AgentCLI.error(changeset) == "name can't be blank"
    end
  end
end

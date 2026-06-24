defmodule SuikouWeb.AgentCLI.CommentsTest do
  use Suikou.DataCase

  import ExUnit.CaptureIO
  import Suikou.Factory

  alias Suikou.Events
  alias Suikou.Reads
  alias Suikou.Schemas.Artifact
  alias SuikouWeb.AgentCLI.Comments

  describe "reply/0" do
    test "posts an agent reply, broadcasts the review topic, and emits its id" do
      round = source_round("line 1\nline 2\n")
      %Artifact{review_id: review_id} = Reads.get_artifact(round.artifact_id)
      comment = published_comment(round.id, %{scope: :review, critique_type: :note, body: "x"})
      Events.subscribe(review_id)

      assert %{"reply_id" => id, "error" => nil} =
               run(%{"comment_id" => comment.id, "body" => "fixed"}, &Comments.reply/0)

      assert is_binary(id)
      assert_receive {:review_changed, ^review_id, _artifact_id}
    end

    test "emits comment_not_found for an unknown comment" do
      assert %{"reply_id" => nil, "error" => "comment_not_found"} =
               run(%{"comment_id" => Ecto.UUID.generate(), "body" => "x"}, &Comments.reply/0)
    end
  end

  defp run(payload, fun) do
    [input: Jason.encode!(payload)]
    |> capture_io(fun)
    |> Jason.decode!()
  end
end

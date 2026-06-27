defmodule Suikou.EventsTest do
  use ExUnit.Case, async: true

  alias Suikou.Events

  describe "files_changed/2" do
    test "broadcasts {:files_changed, review_id, rel_path} to subscribers" do
      review_id = "rv-#{System.unique_integer([:positive])}"
      Events.subscribe(review_id)

      assert :ok = Events.files_changed(review_id, "lib/a.ex")

      assert_receive {:files_changed, ^review_id, "lib/a.ex"}
    end
  end
end

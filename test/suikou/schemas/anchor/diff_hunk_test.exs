defmodule Suikou.Schemas.Anchor.DiffHunkTest do
  use ExUnit.Case, async: true

  alias Suikou.Schemas.Anchor.DiffHunk

  doctest DiffHunk

  describe "changeset/2" do
    test "accepts a single-side selection with the captured quote" do
      params = %{side: :new, start_line: 10, end_line: 12, quote: "a\nb\nc"}

      assert %Ecto.Changeset{valid?: true} = DiffHunk.changeset(%DiffHunk{}, params)
    end

    test "rejects an end line before the start line" do
      params = %{side: :new, start_line: 5, end_line: 3, quote: "x"}

      assert %Ecto.Changeset{valid?: false, errors: errors} =
               DiffHunk.changeset(%DiffHunk{}, params)

      assert {"must be greater than or equal to start line", _opts} = errors[:end_line]
    end

    test "rejects a non-positive start line" do
      params = %{side: :old, start_line: 0, end_line: 0, quote: "x"}

      assert %Ecto.Changeset{valid?: false} = DiffHunk.changeset(%DiffHunk{}, params)
    end

    test "rejects an unknown side" do
      params = %{side: :both, start_line: 1, end_line: 1, quote: "x"}

      assert %Ecto.Changeset{valid?: false} = DiffHunk.changeset(%DiffHunk{}, params)
    end
  end
end

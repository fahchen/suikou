defmodule Suikou.Critique.AnchorTest do
  use ExUnit.Case, async: true

  alias Suikou.Critique.Anchor
  alias Suikou.Schemas.Anchor.DiffHunk

  doctest Anchor

  describe "capture_diff_hunk/4 (new side)" do
    test "joins the prefix-stripped new-side lines for the requested range" do
      diff = """
      diff --git a/a.txt b/a.txt
      --- a/a.txt
      +++ b/a.txt
      @@ -1,2 +1,3 @@
       one
      -old
      +two
      +three
      """

      assert %{
               __type__: "diff_hunk",
               side: :new,
               start_line: 2,
               end_line: 3,
               quote: "two\nthree"
             } = Anchor.capture_diff_hunk(diff, :new, 2, 3)
    end

    test "captures context lines on the new side (no + prefix to strip)" do
      diff = """
      @@ -1,2 +1,3 @@
       one
      -old
      +two
      +three
      """

      assert %{quote: "one"} = Anchor.capture_diff_hunk(diff, :new, 1, 1)
    end
  end

  describe "capture_diff_hunk/4 (old side)" do
    test "joins the prefix-stripped old-side lines for the requested range" do
      diff = """
      @@ -1,2 +1,3 @@
       one
      -old
      +two
      +three
      """

      assert %{quote: "one\nold"} = Anchor.capture_diff_hunk(diff, :old, 1, 2)
    end
  end

  describe "resolve/2 with %DiffHunk{}" do
    test "relocates the quote against the live diff text" do
      diff = """
      @@ -1,2 +1,3 @@
       one
      -old
      +two
      +three
      """

      anchor = %DiffHunk{side: :new, start_line: 1, end_line: 1, quote: "one"}

      assert {%{side: :new, start_line: 1, end_line: 1, quote: "one"}, false} =
               Anchor.resolve(anchor, diff)
    end

    test "reports outdated when the quote no longer appears" do
      diff = """
      @@ -1,1 +1,1 @@
      -gone
      +here
      """

      anchor = %DiffHunk{side: :new, start_line: 2, end_line: 2, quote: "two"}

      assert {%{quote: "two"}, true} = Anchor.resolve(anchor, diff)
    end

    test "reports outdated when content is nil" do
      anchor = %DiffHunk{side: :new, start_line: 2, end_line: 2, quote: "two"}

      assert {%{quote: "two"}, true} = Anchor.resolve(anchor, nil)
    end
  end
end

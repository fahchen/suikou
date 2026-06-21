defmodule Suikou.Critique.AnchorTest do
  use ExUnit.Case, async: true

  alias Suikou.Critique.Anchor
  alias Suikou.Schemas.Anchor.DiffHunk
  alias Suikou.Schemas.Anchor.Element
  alias Suikou.Schemas.Anchor.LineRange

  doctest Anchor

  describe "locate/3 (line range)" do
    test "an exact full-line match relocates and tags :exact" do
      assert {:ok, {2, 2}, :exact} = Anchor.locate(["a", "b", "c"], "b", 1)
    end

    test "picks the occurrence nearest the hint when the quote repeats" do
      assert {:ok, {3, 3}, :exact} = Anchor.locate(["b", "x", "b"], "b", 3)
    end

    test "a slightly edited line above the threshold tags :fuzzy at the new range" do
      assert {:ok, {2, 2}, :fuzzy} =
               Anchor.locate(
                 ["intro", "rate limit is 120 rps", "outro"],
                 "rate limit is 100 rps",
                 2
               )
    end

    test "a multi-line quote drifts as a contiguous window" do
      lines = ["alphz", "betta", "gamma"]

      assert {:ok, {1, 2}, :fuzzy} = Anchor.locate(lines, "alpha\nbeta", 1)
    end

    test "ties on similarity break toward the hint" do
      lines = ["alphz", "filler", "alphz"]

      assert {:ok, {3, 3}, :fuzzy} = Anchor.locate(lines, "alpha", 3)
      assert {:ok, {1, 1}, :fuzzy} = Anchor.locate(lines, "alpha", 1)
    end

    test "a line changed beyond recognition is :not_found" do
      assert :not_found = Anchor.locate(["wholly different"], "rate limit is 100 rps", 1)
    end
  end

  describe "resolve/2 with %LineRange{}" do
    test "an exact match resolves :current at the located range" do
      anchor = %LineRange{start_line: 2, end_line: 2, quote: "b"}

      assert {%{start_line: 2, end_line: 2, quote: "b"}, :current} =
               Anchor.resolve(anchor, ["x", "b", "c"])
    end

    test "a slightly changed line resolves :drifted at the relocated range" do
      anchor = %LineRange{start_line: 1, end_line: 1, quote: "rate limit is 100 rps"}

      assert {%{start_line: 2, end_line: 2, quote: "rate limit is 100 rps"}, :drifted} =
               Anchor.resolve(anchor, ["intro", "rate limit is 120 rps"])
    end

    test "a line changed beyond recognition resolves :outdated at the last-known range" do
      anchor = %LineRange{start_line: 1, end_line: 1, quote: "rate limit is 100 rps"}

      assert {%{start_line: 1, end_line: 1, quote: "rate limit is 100 rps"}, :outdated} =
               Anchor.resolve(anchor, ["wholly different"])
    end

    test "non-list content resolves :outdated" do
      anchor = %LineRange{start_line: 1, end_line: 1, quote: "a"}

      assert {%{quote: "a"}, :outdated} = Anchor.resolve(anchor, nil)
    end
  end

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

      assert {%{side: :new, start_line: 1, end_line: 1, quote: "one"}, :current} =
               Anchor.resolve(anchor, diff)
    end

    test "reports outdated when the quote no longer appears" do
      diff = """
      @@ -1,1 +1,1 @@
      -gone
      +here
      """

      anchor = %DiffHunk{side: :new, start_line: 2, end_line: 2, quote: "two"}

      assert {%{quote: "two"}, :outdated} = Anchor.resolve(anchor, diff)
    end

    test "reports outdated when content is nil — diff hunks never drift" do
      anchor = %DiffHunk{side: :new, start_line: 2, end_line: 2, quote: "two"}

      assert {%{quote: "two"}, :outdated} = Anchor.resolve(anchor, nil)
    end
  end

  describe "capture_element/2" do
    test "packages the client-supplied selector and quote verbatim" do
      assert %{__type__: "element", selector: "main > p", quote: "Hello"} =
               Anchor.capture_element("main > p", "Hello")
    end
  end

  describe "resolve/2 with %Element{}" do
    test "echoes the stored selector and quote with outdated=false" do
      anchor = %Element{selector: "main > p:nth-of-type(2)", quote: "Hello"}

      assert {%{selector: "main > p:nth-of-type(2)", quote: "Hello"}, :current} =
               Anchor.resolve(anchor, "<irrelevant/>")
    end

    test "echoes verbatim even when content is nil — never marks outdated" do
      anchor = %Element{selector: "main", quote: "Hi"}

      assert {%{selector: "main", quote: "Hi"}, :current} = Anchor.resolve(anchor, nil)
    end
  end
end

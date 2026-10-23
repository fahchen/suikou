import { describe, expect, it } from "vitest"

import { diffSideRows, locateDiffQuote } from "./reanchor"

const patch = [
  "diff --git a/lib/a.ex b/lib/a.ex",
  "--- a/lib/a.ex",
  "+++ b/lib/a.ex",
  "@@ -1,4 +1,5 @@",
  " defmodule A do",
  "-  def a, do: 1",
  "+  def a, do: 2",
  "+  def b, do: 3",
  "   def c, do: 4",
  " end",
  "@@ -20,3 +21,3 @@",
  " defmodule B do",
  "+  def b, do: 3",
  "-  def gone, do: 0",
  " end",
].join("\n")

describe("diffSideRows", () => {
  it("lists context plus the side's own changes with that side's numbers", () => {
    expect(diffSideRows(patch, "old").map((row) => [row.line, row.text])).toEqual([
      [1, "defmodule A do"],
      [2, "  def a, do: 1"],
      [3, "  def c, do: 4"],
      [4, "end"],
      [20, "defmodule B do"],
      [21, "  def gone, do: 0"],
      [22, "end"],
    ])
    expect(diffSideRows(patch, "new").map((row) => row.line)).toEqual([1, 2, 3, 4, 5, 21, 22, 23])
  })
})

describe("locateDiffQuote", () => {
  const newRows = diffSideRows(patch, "new")
  const oldRows = diffSideRows(patch, "old")

  it("keeps a quote found at its stored lines", () => {
    expect(locateDiffQuote(newRows, "  def a, do: 2", 2)).toEqual({ start: 2, end: 2 })
  })

  it("follows a quote that now sits at other lines", () => {
    expect(locateDiffQuote(newRows, "  def c, do: 4\nend", 40)).toEqual({ start: 4, end: 5 })
  })

  it("returns null when the quote is not in the diff", () => {
    expect(locateDiffQuote(newRows, "  def missing, do: 9", 2)).toBeNull()
  })

  it("does not match a quote on the other side", () => {
    expect(locateDiffQuote(newRows, "  def gone, do: 0", 21)).toBeNull()
    expect(locateDiffQuote(oldRows, "  def gone, do: 0", 21)).toEqual({ start: 21, end: 21 })
  })

  it("picks the occurrence nearest the stored start line", () => {
    expect(locateDiffQuote(newRows, "  def b, do: 3", 1)).toEqual({ start: 3, end: 3 })
    expect(locateDiffQuote(newRows, "  def b, do: 3", 30)).toEqual({ start: 22, end: 22 })
  })

  it("does not match a quote running past the rows", () => {
    expect(locateDiffQuote(newRows, "end\nextra", 23)).toBeNull()
  })
})

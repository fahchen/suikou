import { describe, it, expect } from "vitest"

import { parseUnifiedDiff, quoteDiffSide } from "./diff-parse"

describe("parseUnifiedDiff", () => {
  it("returns no hunks for an empty diff", () => {
    expect(parseUnifiedDiff("").hunks).toEqual([])
  })

  it("skips the file header before the first hunk", () => {
    const diff = ["diff --git a/x b/x", "--- a/x", "+++ b/x", "@@ -1,1 +1,1 @@", " a"].join("\n")
    const parsed = parseUnifiedDiff(diff)
    expect(parsed.hunks).toHaveLength(1)
    expect(parsed.hunks[0].header).toBe("@@ -1,1 +1,1 @@")
    expect(parsed.hunks[0].rows).toEqual([
      { old: { lineNo: 1, text: "a" }, new: { lineNo: 1, text: "a" }, kind: "context" }
    ])
  })

  it("emits per-side line numbers for context, add, and remove rows", () => {
    const diff = ["@@ -1,3 +1,3 @@", " a", "-b", "+B", " c"].join("\n")
    const [hunk] = parseUnifiedDiff(diff).hunks
    expect(hunk.oldStart).toBe(1)
    expect(hunk.newStart).toBe(1)
    expect(hunk.rows).toEqual([
      { old: { lineNo: 1, text: "a" }, new: { lineNo: 1, text: "a" }, kind: "context" },
      { old: { lineNo: 2, text: "b" }, new: { lineNo: 2, text: "B" }, kind: "replace" },
      { old: { lineNo: 3, text: "c" }, new: { lineNo: 3, text: "c" }, kind: "context" }
    ])
  })

  it("pairs runs of - and + then emits the unpaired tail", () => {
    const diff = ["@@ -1,2 +1,3 @@", "-a", "-b", "+A", "+B", "+C"].join("\n")
    const [hunk] = parseUnifiedDiff(diff).hunks
    expect(hunk.rows).toEqual([
      { old: { lineNo: 1, text: "a" }, new: { lineNo: 1, text: "A" }, kind: "replace" },
      { old: { lineNo: 2, text: "b" }, new: { lineNo: 2, text: "B" }, kind: "replace" },
      { old: null, new: { lineNo: 3, text: "C" }, kind: "add" }
    ])
  })

  it("skips the no-newline marker without advancing line numbers", () => {
    const diff = ["@@ -1,1 +1,1 @@", "-a", "\\ No newline at end of file", "+b"].join("\n")
    const [hunk] = parseUnifiedDiff(diff).hunks
    expect(hunk.rows).toEqual([
      { old: { lineNo: 1, text: "a" }, new: { lineNo: 1, text: "b" }, kind: "replace" }
    ])
  })

  it("starts a new hunk on each @@ header", () => {
    const diff = ["@@ -1,1 +1,1 @@", " a", "@@ -10,1 +12,1 @@", " z"].join("\n")
    const hunks = parseUnifiedDiff(diff).hunks
    expect(hunks).toHaveLength(2)
    expect(hunks[1].oldStart).toBe(10)
    expect(hunks[1].newStart).toBe(12)
    expect(hunks[1].rows[0]).toEqual({
      old: { lineNo: 10, text: "z" },
      new: { lineNo: 12, text: "z" },
      kind: "context"
    })
  })
})

describe("quoteDiffSide", () => {
  it("joins prefix-stripped texts on the requested side", () => {
    const diff = ["@@ -1,3 +1,3 @@", " a", "-b", "+B", " c"].join("\n")
    const parsed = parseUnifiedDiff(diff)
    expect(quoteDiffSide(parsed, "old", 1, 3)).toBe("a\nb\nc")
    expect(quoteDiffSide(parsed, "new", 1, 3)).toBe("a\nB\nc")
  })

  it("skips rows whose side is blank", () => {
    const diff = ["@@ -1,1 +1,2 @@", " a", "+B"].join("\n")
    const parsed = parseUnifiedDiff(diff)
    expect(quoteDiffSide(parsed, "old", 1, 2)).toBe("a")
    expect(quoteDiffSide(parsed, "new", 1, 2)).toBe("a\nB")
  })

  it("returns empty string when no row falls inside the range", () => {
    const diff = ["@@ -1,1 +1,1 @@", " a"].join("\n")
    expect(quoteDiffSide(parseUnifiedDiff(diff), "new", 5, 9)).toBe("")
  })
})

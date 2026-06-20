import { describe, it, expect } from "vitest"

import { orderedReviewFiles, adjacentReviewFiles } from "./file-order"
import type { ReviewFileEntry } from "./types"

function file(path: string, artifactId: string | null = null): ReviewFileEntry {
  return { path, artifact_id: artifactId } as ReviewFileEntry
}

describe("orderedReviewFiles", () => {
  it("places folders before files at each level, alphabetical within a group", () => {
    const ordered = orderedReviewFiles([
      file("a.txt"),
      file("dir/b.txt"),
      file("dir/a.txt"),
      file("README.md")
    ])
    expect(ordered.map((f) => f.path)).toEqual([
      "dir/a.txt",
      "dir/b.txt",
      "a.txt",
      "README.md"
    ])
  })

  it("orders by tree traversal rather than raw path comparison", () => {
    const ordered = orderedReviewFiles([file("a.txt"), file("dir/b.txt")])
    expect(ordered.map((f) => f.path)).toEqual(["dir/b.txt", "a.txt"])
  })
})

describe("adjacentReviewFiles", () => {
  const files = [
    file("dir/a.txt", "art-1"),
    file("dir/b.txt", "art-2"),
    file("a.txt", "art-3")
  ]

  it("returns the surrounding files in tree order", () => {
    const { prev, next } = adjacentReviewFiles(files, "dir/b.txt")
    expect(prev?.path).toBe("dir/a.txt")
    expect(next?.path).toBe("a.txt")
  })

  it("yields null past each end", () => {
    expect(adjacentReviewFiles(files, "dir/a.txt").prev).toBeNull()
    expect(adjacentReviewFiles(files, "a.txt").next).toBeNull()
  })

  it("finds neighbours for an unminted file with no artifact id", () => {
    const withUnminted = [file("dir/a.txt", "art-1"), file("dir/b.txt", null), file("a.txt", "art-3")]
    const { prev, next } = adjacentReviewFiles(withUnminted, "dir/b.txt")
    expect(prev?.path).toBe("dir/a.txt")
    expect(next?.path).toBe("a.txt")
  })

  it("disables both ends when the path is not in the list", () => {
    expect(adjacentReviewFiles(files, "missing.txt")).toEqual({ prev: null, next: null })
  })
})

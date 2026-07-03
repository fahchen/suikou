import { describe, it, expect } from "vitest"

import { resnapshotSummary } from "./resnapshot-summary"
import type { ReviewStructure } from "./use-review-structure"
import type { ReviewSnapshot } from "./types"

function structure(overrides: Partial<ReviewStructure> = {}): ReviewStructure {
  return {
    review_id: "r1",
    exists: true,
    name: "R",
    kind: "file",
    latest_round: 2,
    files: [],
    file_entries: [],
    refs: null,
    ...overrides,
  } as ReviewStructure
}

function file(overrides: {
  path: string
  roundHash?: string | null
  drifted?: number
}): ReviewSnapshot["body"]["files"][number] {
  const items = Array.from({ length: overrides.drifted ?? 0 }, (_, i) => ({
    id: `c${i}`,
    status: "published" as const,
    drifted: true,
  })) as ReviewSnapshot["body"]["files"][number]["comments"]["items"]
  return {
    path: overrides.path,
    current_round: {
      number: 2,
      content_hash: overrides.roundHash ?? "H_ROUND",
      is_latest: true,
    },
    comments: { items },
    latest_verdict: null,
    draft_verdict: null,
    disk_version: 0,
  } as ReviewSnapshot["body"]["files"][number]
}

describe("resnapshotSummary", () => {
  it("returns zero when every file's disk hash matches its round hash", () => {
    const s = structure({
      files: [{ path: "a.ex", content_hash: "H_ROUND" }] as ReviewStructure["files"],
    })
    const summary = resnapshotSummary(s, [file({ path: "a.ex", roundHash: "H_ROUND" })])
    expect(summary).toEqual({ filesChanged: 0, driftedAnchors: 0 })
  })

  it("counts a file whose disk hash differs from its round hash", () => {
    const s = structure({
      files: [
        { path: "a.ex", content_hash: "H_DISK" },
        { path: "b.ex", content_hash: "H_SAME" },
      ] as ReviewStructure["files"],
    })
    const summary = resnapshotSummary(s, [
      file({ path: "a.ex", roundHash: "H_ROUND" }),
      file({ path: "b.ex", roundHash: "H_SAME" }),
    ])
    expect(summary.filesChanged).toBe(1)
  })

  it("sums drifted published anchors across files", () => {
    const s = structure({
      files: [
        { path: "a.ex", content_hash: "H1" },
        { path: "b.ex", content_hash: "H2" },
      ] as ReviewStructure["files"],
    })
    const summary = resnapshotSummary(s, [
      file({ path: "a.ex", roundHash: "H1", drifted: 2 }),
      file({ path: "b.ex", roundHash: "H2", drifted: 1 }),
    ])
    expect(summary.driftedAnchors).toBe(3)
  })

  it("ignores files whose disk hash isn't known yet (structure lag)", () => {
    const s = structure({
      files: [{ path: "a.ex", content_hash: null }] as ReviewStructure["files"],
    })
    const summary = resnapshotSummary(s, [file({ path: "a.ex", roundHash: "H_ROUND" })])
    expect(summary.filesChanged).toBe(0)
  })
})

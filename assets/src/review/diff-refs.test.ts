import { describe, it, expect } from "vitest"

import {
  formatRefLabel,
  formatRefsRange,
  refsBranchDeleted,
  refsMoved,
  shortSha,
  vanishedSide,
  type DiffRefs
} from "./diff-refs"

function refs(overrides: Partial<DiffRefs>): DiffRefs {
  return {
    base_ref: "main",
    head_ref: "feature/x",
    base_sha: "abcdef1234567890abcdef1234567890abcdef12",
    head_sha: "1234567890abcdef1234567890abcdef12345678",
    creation_base_sha: "abcdef1234567890abcdef1234567890abcdef12",
    creation_head_sha: "1234567890abcdef1234567890abcdef12345678",
    refs_moved: false,
    ...overrides
  }
}

describe("shortSha", () => {
  it("returns the first seven characters", () => {
    expect(shortSha("abcdef1234567890")).toBe("abcdef1")
  })

  it("passes null through", () => {
    expect(shortSha(null)).toBe(null)
  })
})

describe("formatRefLabel", () => {
  it("joins ref and current short SHA with @", () => {
    expect(formatRefLabel("main", "abcdef1234567890", null)).toBe("main@abcdef1")
  })

  it("falls back to creation SHA when the branch is gone", () => {
    expect(formatRefLabel("main", null, "1234567890abcdef")).toBe("main@1234567")
  })

  it("shows the ref alone when no SHA is known at all", () => {
    expect(formatRefLabel("main", null, null)).toBe("main")
  })
})

describe("formatRefsRange", () => {
  it("renders base@sha..head@sha", () => {
    expect(formatRefsRange(refs({}))).toBe("main@abcdef1..feature/x@1234567")
  })
})

describe("refsMoved / refsBranchDeleted", () => {
  it("is quiet when both sides match their pinned SHA", () => {
    const r = refs({})
    expect(refsMoved(r)).toBe(false)
    expect(refsBranchDeleted(r)).toBe(false)
    expect(vanishedSide(r)).toBe(null)
  })

  it("flags a moved head branch", () => {
    const r = refs({ head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", refs_moved: true })
    expect(refsMoved(r)).toBe(true)
    expect(refsBranchDeleted(r)).toBe(false)
  })

  it("marks a deleted head branch as vanished, not moved", () => {
    const r = refs({ head_sha: null, refs_moved: false })
    expect(refsBranchDeleted(r)).toBe(true)
    expect(refsMoved(r)).toBe(false)
    expect(vanishedSide(r)).toBe("head")
  })

  it("suppresses `refs moved` when either side vanished", () => {
    const r = refs({ base_sha: null, head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", refs_moved: true })
    expect(refsBranchDeleted(r)).toBe(true)
    expect(refsMoved(r)).toBe(false)
  })
})

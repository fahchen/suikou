import { describe, it, expect } from "vitest"

import { visibleComments, pendingCount, hasUnresolvedBlocker } from "./store-context"
import type { Comment } from "./types"
import type { CritiqueType, StatusFilter } from "../stores/ui-store"

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    scope: "line",
    critique_type: "note",
    status: "published",
    body: "body",
    resolved: false,
    resolved_round: null,
    outdated: false,
    original_round: null,
    carried: false,
    inserted_at: "2026-01-01T00:00:00Z",
    anchor: null,
    replies: [],
    ...overrides
  }
}

const ALL_TYPES: Record<CritiqueType, boolean> = {
  fix_required: true,
  needs_answer: true,
  note: true
}

describe("visibleComments", () => {
  it("keeps everything when status is all and all types enabled", () => {
    const comments = [comment({ id: "a", resolved: true }), comment({ id: "b" })]
    expect(visibleComments(comments, "all", ALL_TYPES).map((c) => c.id)).toEqual(["a", "b"])
  })

  it("filters to unresolved only", () => {
    const comments = [comment({ id: "a", resolved: true }), comment({ id: "b" })]
    const status: StatusFilter = "unresolved"
    expect(visibleComments(comments, status, ALL_TYPES).map((c) => c.id)).toEqual(["b"])
  })

  it("filters to resolved only", () => {
    const comments = [comment({ id: "a", resolved: true }), comment({ id: "b" })]
    expect(visibleComments(comments, "resolved", ALL_TYPES).map((c) => c.id)).toEqual(["a"])
  })

  it("drops comments whose critique type is disabled", () => {
    const comments = [
      comment({ id: "a", critique_type: "fix_required" }),
      comment({ id: "b", critique_type: "note" })
    ]
    const onlyNotes = { ...ALL_TYPES, fix_required: false }
    expect(visibleComments(comments, "all", onlyNotes).map((c) => c.id)).toEqual(["b"])
  })

  it("combines status and type filters", () => {
    const comments = [
      comment({ id: "a", critique_type: "fix_required", resolved: false }),
      comment({ id: "b", critique_type: "fix_required", resolved: true }),
      comment({ id: "c", critique_type: "note", resolved: false })
    ]
    const onlyFix = { ...ALL_TYPES, note: false, needs_answer: false }
    expect(visibleComments(comments, "unresolved", onlyFix).map((c) => c.id)).toEqual(["a"])
  })
})

describe("pendingCount", () => {
  it("counts only pending comments", () => {
    const comments = [
      comment({ id: "a", status: "pending" }),
      comment({ id: "b", status: "published" }),
      comment({ id: "c", status: "pending" })
    ]
    expect(pendingCount(comments)).toBe(2)
  })

  it("is zero with no pending comments", () => {
    expect(pendingCount([comment({ status: "published" })])).toBe(0)
  })
})

describe("hasUnresolvedBlocker", () => {
  it("is true when an unresolved fix_required exists", () => {
    expect(hasUnresolvedBlocker([comment({ critique_type: "fix_required", resolved: false })])).toBe(
      true
    )
  })

  it("is false when the fix_required is resolved", () => {
    expect(hasUnresolvedBlocker([comment({ critique_type: "fix_required", resolved: true })])).toBe(
      false
    )
  })

  it("is false for unresolved non-blocking types", () => {
    expect(hasUnresolvedBlocker([comment({ critique_type: "note", resolved: false })])).toBe(false)
  })
})

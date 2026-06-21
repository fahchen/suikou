import { describe, it, expect } from "vitest"

import { buildCopyText } from "./copy"
import type { Comment } from "./types"

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    scope: "located",
    critique_type: "note",
    status: "published",
    body: "body",
    resolved: false,
    resolved_round: null,
    outdated: false,
    drifted: false,
    authored_round: 0,
    inserted_at: "2026-01-01T00:00:00Z",
    anchor: null,
    replies: [],
    ...overrides
  }
}

describe("buildCopyText", () => {
  it("renders an unresolved problem with type, anchor, quote, and body", () => {
    const text = buildCopyText(
      "auth.md",
      2,
      [
        comment({
          critique_type: "fix_required",
          body: "use <= here",
          anchor: { type: "line_range", start_line: 10, end_line: 12, quote: "a\nb" }
        })
      ],
      "noteworthy"
    )

    expect(text).toContain("# Review: auth.md — Round 2")
    expect(text).toContain("## Unresolved (1)")
    expect(text).toContain("### [Fix required] L10–12")
    expect(text).toContain("> a\n> b")
    expect(text).toContain("use <= here")
  })

  it("collapses a single-line anchor and labels a missing anchor", () => {
    const single = buildCopyText("f", 0, [comment({ anchor: { type: "line_range", start_line: 5, end_line: 5, quote: "x" } })], "noteworthy")
    expect(single).toContain("L5")

    const none = buildCopyText("f", 0, [comment({ anchor: null })], "noteworthy")
    expect(none).toContain("[Note] no anchor")
  })

  it("includes replies for unresolved problems", () => {
    const text = buildCopyText(
      "f",
      1,
      [
        comment({
          replies: [
            { id: "r1", author: "agent", status: "published", body: "fixed", inserted_at: "2026-01-01T00:00:00Z" },
            { id: "r2", author: "human", status: "published", body: "still broken", inserted_at: "2026-01-01T00:00:00Z" }
          ]
        })
      ],
      "noteworthy"
    )

    expect(text).toContain("Replies:")
    expect(text).toContain("- agent: fixed")
    expect(text).toContain("- human: still broken")
  })

  it("omits the resolved section in noteworthy mode and includes it in all mode", () => {
    const comments = [comment({ id: "u" }), comment({ id: "r", resolved: true })]

    const noteworthy = buildCopyText("f", 1, comments, "noteworthy")
    expect(noteworthy).not.toContain("## Resolved")

    const all = buildCopyText("f", 1, comments, "all")
    expect(all).toContain("## Resolved (1)")
  })

  it("drops replies from resolved problems in all mode", () => {
    const text = buildCopyText(
      "f",
      1,
      [
        comment({
          resolved: true,
          replies: [{ id: "r1", author: "human", status: "published", body: "noise", inserted_at: "2026-01-01T00:00:00Z" }]
        })
      ],
      "all"
    )

    expect(text).not.toContain("Replies:")
  })
})

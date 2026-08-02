import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

import { CommentCard } from "./CommentCard"
import type { Comment } from "./shared"

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub)

describe("CommentCard", () => {
  test("keeps focus activation on its explicit control, not the thread card", () => {
    const onFocus = vi.fn()

    render(
      <CommentCard
        comment={comment}
        className=""
        body={<p>Comment body</p>}
        onFocus={onFocus}
      />,
    )

    const card = document.querySelector("[data-thread-card]")
    expect(card).not.toHaveAttribute("role", "button")
    expect(card).not.toHaveClass("cursor-pointer")

    fireEvent.click(screen.getByRole("button", { name: "Focus comment" }))
    expect(onFocus).toHaveBeenCalledOnce()
  })

  test("a drifted comment shows the first line of its original quote", () => {
    render(
      <CommentCard
        comment={{ ...comment, drifted: true, anchor: { type: "line_range", start_line: 1, end_line: 2, quote: "old first\nold second" } }}
        className=""
        metaLine={<span>L1-2</span>}
        body={<p>Comment body</p>}
      />,
    )

    expect(screen.getByText("old first")).toBeInTheDocument()
    expect(screen.queryByText(/old second/)).not.toBeInTheDocument()
  })
})

const comment = {
  id: "comment-1",
  scope: "located",
  critique_type: "note",
  status: "published",
  author: { kind: "human", name: "human", icon: null },
  body: "Comment body",
  resolved: false,
  resolved_round: null,
  resolved_by: null,
  outdated: false,
  drifted: false,
  authored_round: 1,
  inserted_at: "2026-07-26T00:00:00Z",
  anchor: { type: "line_range", start_line: 1, end_line: 1, quote: "line" },
  replies: [],
  reactions: [],
} as Comment

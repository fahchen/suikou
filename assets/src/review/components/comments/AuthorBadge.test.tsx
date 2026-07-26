import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

import { AuthorBadge } from "./AuthorBadge"
import type { CommentAuthor } from "./shared"

vi.mock("../../../stores/ui-store", () => ({ uiStore: { userEmoji: null } }))

describe("AuthorBadge", () => {
  test("groups an agent avatar and name in one themed badge", () => {
    const author: CommentAuthor = { kind: "agent", name: "Codex", icon: "🔍" }

    render(<AuthorBadge author={author} />)

    const badge = screen.getByText("Codex").parentElement
    expect(badge).toHaveTextContent("🔍Codex")
    expect(badge).toHaveClass("bg-accent-soft")
    expect(badge).toHaveClass("ring-accent-edge")
  })

  test("can render an agent identity without a second container", () => {
    const author: CommentAuthor = { kind: "agent", name: "LintBot", icon: "🧹" }

    render(<AuthorBadge author={author} appearance="bare" />)

    const identity = screen.getByText("LintBot").parentElement
    expect(identity).not.toHaveClass("bg-accent-soft")
    expect(identity).not.toHaveClass("ring-accent-edge")
  })
})

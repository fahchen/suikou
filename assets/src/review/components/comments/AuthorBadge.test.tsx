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
    expect(badge).toHaveClass("pr-0")
    expect(screen.getByText("Codex")).toHaveClass("-ml-1.5")
  })
})

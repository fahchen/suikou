import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

import { Reactions } from "./Reactions"
import type { CommentReaction } from "./shared"

vi.mock("../../../musubi", () => ({
  useMusubiCommand: () => ({ dispatch: vi.fn(), isPending: false }),
}))

describe("Reactions", () => {
  test("groups an agent avatar and name in the themed reaction badge", () => {
    const reactions: CommentReaction[] = [
      { emoji: "eyes", actor: "agent", count: 1, mine: false, by: [{ name: "Codex", icon: "🤖" }] },
    ]

    render(<Reactions reactions={reactions} targetId="comment-1" target="comment" commentsProxy={null} />)

    const agentBadge = screen.getByText("Codex").parentElement
    expect(agentBadge).toHaveTextContent("🤖Codex")
    expect(agentBadge).toHaveClass("h-[19px]")
    expect(agentBadge).toHaveClass("bg-accent-soft")
    expect(agentBadge?.parentElement).toHaveClass("pr-0")
  })
})

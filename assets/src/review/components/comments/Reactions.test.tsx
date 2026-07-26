import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

import { Reactions } from "./Reactions"
import type { CommentReaction } from "./shared"

vi.mock("../../../musubi", () => ({
  useMusubiCommand: () => ({ dispatch: vi.fn(), isPending: false }),
}))

describe("Reactions", () => {
  test("docks an agent's reaction on its shared identity marker", () => {
    const reactions: CommentReaction[] = [
      { emoji: "eyes", actor: "agent", count: 1, mine: false, by: [{ name: "Codex", icon: "🤖" }] },
    ]

    render(<Reactions reactions={reactions} targetId="comment-1" target="comment" commentsProxy={null} />)

    const agentBadge = screen.getByText("Codex").parentElement
    expect(agentBadge).toHaveTextContent("🤖Codex")
    expect(agentBadge).toHaveClass("flex-col")
    expect(agentBadge?.firstElementChild).toHaveClass("bg-control")
    expect(agentBadge?.parentElement).toHaveTextContent("👀")
    expect(agentBadge?.parentElement).not.toHaveClass("rounded-full")
  })
})

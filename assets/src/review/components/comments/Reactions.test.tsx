import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

import { Reactions } from "./Reactions"
import type { CommentReaction } from "./shared"

vi.mock("../../../musubi", () => ({
  useMusubiCommand: () => ({ dispatch: vi.fn(), isPending: false }),
}))

describe("Reactions", () => {
  test("shows an agent's reaction as one pill: who reacted, then what they said", () => {
    const reactions: CommentReaction[] = [
      { emoji: "eyes", actor: "agent", count: 1, mine: false, by: [{ name: "Codex", icon: "🤖" }] },
    ]

    render(<Reactions reactions={reactions} targetId="comment-1" target="comment" commentsProxy={null} />)

    const chip = screen.getByText("Codex").closest("span[title]")
    expect(chip).toHaveTextContent("🤖Codex👀")
    expect(chip).toHaveClass("rounded-full")
  })
})

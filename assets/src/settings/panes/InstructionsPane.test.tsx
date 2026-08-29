import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

let snapshot: { review_instructions: string | null; saved_at: string | null } = {
  review_instructions: null,
  saved_at: null,
}
const dispatch = vi.fn(() => Promise.resolve({ error: null }))

vi.mock("../../musubi", () => ({
  storeCache: {},
  useMusubiRoot: () => ({ status: "ready", store: {} }),
  useMusubiSnapshot: () => snapshot,
  useMusubiCommand: () => ({ dispatch, isPending: false }),
}))

import { InstructionsPane } from "./InstructionsPane"

describe("InstructionsPane", () => {
  test("keeps the trailing space the human typed when the trimmed save echoes back", async () => {
    const { rerender } = render(<InstructionsPane />)
    const box = screen.getByLabelText("Global review instructions")

    fireEvent.change(box, { target: { value: "Reply in English. " } })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    expect(dispatch).toHaveBeenCalledWith({ review_instructions: "Reply in English. " })

    // The server stores the trimmed text and pushes it back.
    snapshot = { review_instructions: "Reply in English.", saved_at: "2026-08-28T00:00:00Z" }
    rerender(<InstructionsPane />)

    expect(screen.getByLabelText("Global review instructions")).toHaveValue("Reply in English. ")
  })

  test("adopts an instruction set somewhere else", () => {
    const { rerender } = render(<InstructionsPane />)

    snapshot = { review_instructions: "Written on another tab.", saved_at: "2026-08-28T00:00:00Z" }
    rerender(<InstructionsPane />)

    expect(screen.getByLabelText("Global review instructions")).toHaveValue("Written on another tab.")
  })

  beforeEach(() => {
    vi.useFakeTimers()
    snapshot = { review_instructions: null, saved_at: null }
    dispatch.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })
})

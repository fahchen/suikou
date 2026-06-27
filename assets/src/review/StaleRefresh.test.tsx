import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { StaleRefresh } from "./StaleRefresh"

describe("StaleRefresh", () => {
  it("renders the stale badge and a refresh button", () => {
    render(<StaleRefresh onRefresh={() => {}} />)
    expect(screen.getByText(/changed on disk/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /refresh/i })).toBeTruthy()
  })

  it("calls onRefresh when the refresh button is clicked", () => {
    const onRefresh = vi.fn()
    render(<StaleRefresh onRefresh={onRefresh} />)
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})

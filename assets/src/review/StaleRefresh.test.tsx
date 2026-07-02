import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { StaleRefresh } from "./StaleRefresh"

describe("StaleRefresh", () => {
  it("renders a labelled reload control marking the file as changed on disk", () => {
    render(<StaleRefresh onRefresh={() => {}} />)
    expect(screen.getByRole("button", { name: /changed on disk/i })).toBeTruthy()
  })

  it("calls onRefresh when clicked", () => {
    const onRefresh = vi.fn()
    render(<StaleRefresh onRefresh={onRefresh} />)
    fireEvent.click(screen.getByRole("button", { name: /changed on disk/i }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, act } from "@testing-library/react"

import { ConnectionPill } from "./ConnectionPill"

const conn = vi.hoisted(() => ({ connected: true }))

vi.mock("../musubi", () => ({
  useSocketConnected: () => conn.connected
}))

describe("ConnectionPill", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    conn.connected = true
  })
  afterEach(() => vi.useRealTimers())

  it("renders nothing while connected", () => {
    conn.connected = true
    const { container } = render(<ConnectionPill />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows Reconnecting only after the grace delay while dropped", () => {
    conn.connected = false
    const { container, getByText } = render(<ConnectionPill />)
    // Stay quiet until the grace window elapses, to ride out micro-reconnects.
    expect(container).toBeEmptyDOMElement()
    act(() => void vi.advanceTimersByTime(600))
    expect(getByText("Reconnecting")).toBeTruthy()
  })
})

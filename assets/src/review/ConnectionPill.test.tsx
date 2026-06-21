import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, act } from "@testing-library/react"

// Fake phoenix Socket so we exercise the REAL useSocketConnected (subscription +
// re-render path), not a stubbed hook. Defined via vi.hoisted so the hoisted
// vi.mock factory can reference it.
const h = vi.hoisted(() => {
  class FakeSocket {
    connected = false
    cbs: { open: Array<() => void>; close: Array<() => void>; error: Array<() => void> } = {
      open: [],
      close: [],
      error: [],
    }
    connect() {
      this.connected = true
      this.cbs.open.forEach((c) => c())
    }
    disconnect() {
      this.connected = false
      this.cbs.close.forEach((c) => c())
    }
    isConnected() {
      return this.connected
    }
    onOpen(cb: () => void) {
      this.cbs.open.push(cb)
      return cb
    }
    onClose(cb: () => void) {
      this.cbs.close.push(cb)
      return cb
    }
    onError(cb: () => void) {
      this.cbs.error.push(cb)
      return cb
    }
    off() {}
  }
  return { FakeSocket }
})

vi.mock("phoenix", () => ({ Socket: h.FakeSocket }))

import { socket } from "../musubi"
import { ConnectionPill } from "./ConnectionPill"

type Fake = InstanceType<typeof h.FakeSocket>

describe("ConnectionPill (real hook)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(socket as unknown as Fake).connected = true
  })
  afterEach(() => vi.useRealTimers())

  it("shows Reconnecting after a socket close + grace, then clears on reopen", () => {
    const { container, queryByText } = render(<ConnectionPill />)
    expect(container).toBeEmptyDOMElement()

    act(() => (socket as unknown as Fake).disconnect())
    expect(container).toBeEmptyDOMElement() // still within grace
    act(() => void vi.advanceTimersByTime(600))
    expect(queryByText("Reconnecting")).not.toBeNull()

    act(() => (socket as unknown as Fake).connect())
    expect(container).toBeEmptyDOMElement()
  })
})

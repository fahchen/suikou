import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook } from "@testing-library/react"

import { useScrollRestore } from "./use-scroll-restore"
import { saveScrollOffset, scrollPositionKey } from "./scroll-position"

function makeContainer(): HTMLElement {
  const el = document.createElement("div")
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: 2000 })
  Object.defineProperty(el, "clientHeight", { configurable: true, value: 500 })
  return el
}

beforeEach(() => {
  localStorage.clear()
  // Collapse the restore's double rAF so the offset lands within the test tick.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal("cancelAnimationFrame", () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useScrollRestore", () => {
  it("restores the saved offset once content is ready", () => {
    const container = makeContainer()
    const key = scrollPositionKey("art-1", "rendered")
    saveScrollOffset(key, 800)

    renderHook(() =>
      useScrollRestore({
        container,
        artifactId: "art-1",
        view: "rendered",
        ready: true,
        enabled: true
      })
    )

    expect(container.scrollTop).toBe(800)
  })

  it("restores again after disable→re-enable for the same key", () => {
    const container = makeContainer()
    const key = scrollPositionKey("art-1", "rendered")
    saveScrollOffset(key, 800)

    const props = {
      container,
      artifactId: "art-1",
      view: "rendered" as const,
      ready: true,
      enabled: true
    }
    const { rerender } = renderHook((p) => useScrollRestore(p), {
      initialProps: props
    })

    expect(container.scrollTop).toBe(800)

    // Switch to all-files (hook disabled). Cleanup saves the outgoing 800.
    rerender({ ...props, enabled: false })
    // Stacked view scrolls the shared container elsewhere while disabled.
    container.scrollTop = 0

    // Back to single-file mode: the saved single-file offset restores again
    // instead of staying stuck at the stacked view's position.
    rerender({ ...props, enabled: true })
    expect(container.scrollTop).toBe(800)
  })
})

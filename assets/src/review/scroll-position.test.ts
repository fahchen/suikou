import { describe, it, expect, beforeEach } from "vitest"

import { loadScrollOffset, saveScrollOffset, scrollPositionKey } from "./scroll-position"

beforeEach(() => {
  localStorage.clear()
})

describe("scrollPositionKey", () => {
  it("namespaces by artifact and view so rendered and raw stay separate", () => {
    expect(scrollPositionKey("art-1", "rendered")).toBe("art-1:rendered")
    expect(scrollPositionKey("art-1", "raw")).toBe("art-1:raw")
  })
})

describe("save/load round-trip", () => {
  it("returns the saved offset for the matching key", () => {
    const key = scrollPositionKey("art-1", "rendered")
    saveScrollOffset(key, 480)
    expect(loadScrollOffset(key)).toBe(480)
  })

  it("keeps offsets isolated per artifact and per view", () => {
    saveScrollOffset(scrollPositionKey("art-1", "rendered"), 100)
    saveScrollOffset(scrollPositionKey("art-1", "raw"), 200)
    saveScrollOffset(scrollPositionKey("art-2", "rendered"), 300)

    expect(loadScrollOffset(scrollPositionKey("art-1", "rendered"))).toBe(100)
    expect(loadScrollOffset(scrollPositionKey("art-1", "raw"))).toBe(200)
    expect(loadScrollOffset(scrollPositionKey("art-2", "rendered"))).toBe(300)
  })

  it("rounds fractional offsets to whole pixels", () => {
    const key = scrollPositionKey("art-1", "rendered")
    saveScrollOffset(key, 123.7)
    expect(loadScrollOffset(key)).toBe(124)
  })
})

describe("missing or empty values", () => {
  it("returns null for a key that was never saved", () => {
    expect(loadScrollOffset(scrollPositionKey("nope", "rendered"))).toBeNull()
  })

  it("treats a top-of-page (zero) offset as no restore and clears any prior entry", () => {
    const key = scrollPositionKey("art-1", "rendered")
    saveScrollOffset(key, 500)
    saveScrollOffset(key, 0)
    expect(loadScrollOffset(key)).toBeNull()
  })

  it("survives corrupt JSON in storage by returning null", () => {
    localStorage.setItem("suikou-scroll-positions", "{not json")
    expect(loadScrollOffset(scrollPositionKey("art-1", "rendered"))).toBeNull()
  })
})

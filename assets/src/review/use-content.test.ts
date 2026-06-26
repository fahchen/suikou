import { describe, it, expect } from "vitest"

import { contentErrorFrom, MISSING_CONTENT_MESSAGE, type ContentState } from "./use-content"

function state(overrides: Partial<ContentState>): ContentState {
  return { text: "", loading: false, error: null, missing: false, etag: "", ...overrides }
}

describe("contentErrorFrom", () => {
  it("maps a missing (404) source to the friendly deleted/moved copy", () => {
    expect(contentErrorFrom(state({ missing: true }))).toBe(MISSING_CONTENT_MESSAGE)
  })

  it("passes a genuine fetch failure through unchanged", () => {
    expect(contentErrorFrom(state({ error: "content unavailable (500)" }))).toBe(
      "content unavailable (500)"
    )
  })

  it("returns null when the content is present", () => {
    expect(contentErrorFrom(state({ text: "hello" }))).toBeNull()
  })

  it("prefers the missing copy over a stale error", () => {
    expect(contentErrorFrom(state({ missing: true, error: "boom" }))).toBe(MISSING_CONTENT_MESSAGE)
  })
})

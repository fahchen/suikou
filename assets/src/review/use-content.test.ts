import { describe, it, expect, vi, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"

import {
  contentErrorFrom,
  MISSING_CONTENT_MESSAGE,
  useReviewFileContent,
  type ContentState
} from "./use-content"

function state(overrides: Partial<ContentState>): ContentState {
  return {
    text: "",
    loading: false,
    error: null,
    missing: false,
    etag: "",
    refetch: () => {},
    ...overrides
  }
}

function mockFetch(etag: string | null) {
  const fn = vi.fn(() =>
    Promise.resolve({
      status: 200,
      ok: true,
      text: () => Promise.resolve("source bytes"),
      headers: { get: (k: string) => (k.toLowerCase() === "etag" ? etag : null) }
    } as unknown as Response)
  )
  vi.stubGlobal("fetch", fn)
  return fn
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

describe("useReviewFileContent etag", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uses the served ETag as the highlight key when present", async () => {
    mockFetch('"sha-of-bytes"')
    const { result } = renderHook(() =>
      useReviewFileContent("review-1", "lib/a.ex", "hash-a", true)
    )
    await waitFor(() => expect(result.current.text).toBe("source bytes"))
    expect(result.current.etag).toBe('"sha-of-bytes"')
  })

  it("falls back to the per-file revision key when the backend omits the ETag", async () => {
    mockFetch(null)
    const { result } = renderHook(() =>
      useReviewFileContent("review-1", "lib/a.ex", "hash-a", true)
    )
    await waitFor(() => expect(result.current.text).toBe("source bytes"))
    // Not "" — an empty key would collide every file onto one cache entry.
    expect(result.current.etag).toBe("hash-a")
  })

  it("refetch() forces a new fetch of the same url", async () => {
    const fn = mockFetch('"e"')
    const { result } = renderHook(() => useReviewFileContent("review-1", "lib/a.ex", "hash-a", true))
    await waitFor(() => expect(result.current.text).toBe("source bytes"))
    expect(fn).toHaveBeenCalledTimes(1)

    act(() => result.current.refetch())
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2))
  })
})

import { describe, it, expect, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"

import { diskStale, useDiskStale } from "./use-disk-stale"

describe("diskStale", () => {
  it("is true when the disk version is ahead of the loaded version", () => {
    expect(diskStale(2, 1)).toBe(true)
  })

  it("is false when the loaded version is current", () => {
    expect(diskStale(1, 1)).toBe(false)
  })
})

describe("useDiskStale", () => {
  it("flips stale when disk_version bumps, and clears after refresh", () => {
    const refetch = vi.fn()
    const { result, rerender } = renderHook(({ v }) => useDiskStale(v, "etag-1", refetch), {
      initialProps: { v: 0 }
    })
    expect(result.current.stale).toBe(false)

    rerender({ v: 1 })
    expect(result.current.stale).toBe(true)

    act(() => result.current.refresh())
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(result.current.stale).toBe(false)
  })
})

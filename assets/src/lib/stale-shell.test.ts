import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { reloadForFreshShell, staleShellError } from "./stale-shell"

describe("staleShellError", () => {
  test("recognises how each engine words a missing chunk", () => {
    // Chromium, Firefox, WebKit.
    expect(staleShellError(new Error("Failed to fetch dynamically imported module: /assets/x.js"))).toBe(true)
    expect(staleShellError(new Error("error loading dynamically imported module"))).toBe(true)
    expect(staleShellError(new Error("Importing a module script failed."))).toBe(true)
  })

  test("leaves ordinary application errors alone", () => {
    expect(staleShellError(new Error("Cannot read properties of undefined"))).toBe(false)
    expect(staleShellError(new Error("Couldn't load file (500)."))).toBe(false)
    expect(staleShellError(undefined)).toBe(false)
  })
})

describe("reloadForFreshShell", () => {
  const reload = vi.fn()

  beforeEach(() => {
    sessionStorage.clear()
    reload.mockClear()
    vi.spyOn(window, "location", "get").mockReturnValue({ reload } as unknown as Location)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  test("reloads onto the current shell", () => {
    expect(reloadForFreshShell()).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
  })

  test("refuses a second reload inside the cooldown, so a broken build cannot spin", () => {
    expect(reloadForFreshShell()).toBe(true)

    expect(reloadForFreshShell()).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })

  test("allows another reload once the cooldown has passed, for a later deploy", () => {
    vi.useFakeTimers()
    expect(reloadForFreshShell()).toBe(true)

    vi.advanceTimersByTime(61_000)

    expect(reloadForFreshShell()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})

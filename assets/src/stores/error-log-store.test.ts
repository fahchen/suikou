import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { errorLogStore } from "./error-log-store"

const anError = (message: string, stack = "at foo") => ({
  kind: "error" as const,
  message,
  source: "app.js:1",
  stack,
})

describe("errorLogStore", () => {
  beforeEach(() => {
    localStorage.clear()
    errorLogStore.clear()
    errorLogStore.listen()
  })

  afterEach(() => {
    errorLogStore.stop()
  })

  describe("when collecting is off", () => {
    test("records nothing, so switching off actually stops it", () => {
      errorLogStore.stop()

      errorLogStore.record(anError("after opting out"))

      expect(errorLogStore.entries).toEqual([])
      // Nothing reached storage either — the bug this covers kept writing there
      // while the tab that would have shown it was hidden.
      expect(JSON.parse(localStorage.getItem("suikou-error-log-entries") ?? "[]")).toEqual([])
    })

    test("ignores a real window error once the listeners are detached", () => {
      errorLogStore.stop()

      window.dispatchEvent(new ErrorEvent("error", { message: "after opting out" }))

      expect(errorLogStore.entries).toEqual([])
    })

    test("records again after listening resumes", () => {
      errorLogStore.stop()
      errorLogStore.record(anError("dropped"))
      errorLogStore.listen()

      errorLogStore.record(anError("kept"))

      expect(errorLogStore.entries.map((e) => e.message)).toEqual(["kept"])
    })
  })

  test("keeps the newest error first", () => {
    errorLogStore.record(anError("first"))
    errorLogStore.record(anError("second"))

    expect(errorLogStore.entries.map((e) => e.message)).toEqual(["second", "first"])
  })

  test("collapses an immediate repeat so a loop cannot evict the history", () => {
    errorLogStore.record(anError("cause"))
    errorLogStore.record(anError("loops"))
    errorLogStore.record(anError("loops"))
    errorLogStore.record(anError("loops"))

    expect(errorLogStore.entries.map((e) => e.message)).toEqual(["loops", "cause"])
  })

  test("records a repeat again once something else came between", () => {
    errorLogStore.record(anError("a"))
    errorLogStore.record(anError("b"))
    errorLogStore.record(anError("a"))

    expect(errorLogStore.entries.map((e) => e.message)).toEqual(["a", "b", "a"])
  })

  test("treats a same-message error with a different stack as its own entry", () => {
    errorLogStore.record(anError("boom", "at one"))
    errorLogStore.record(anError("boom", "at two"))

    expect(errorLogStore.entries).toHaveLength(2)
  })

  test("caps the log, dropping the oldest", () => {
    for (let i = 0; i < 60; i++) errorLogStore.record(anError(`e${i}`))

    expect(errorLogStore.entries).toHaveLength(50)
    expect(errorLogStore.entries[0].message).toBe("e59")
    expect(errorLogStore.entries.at(-1)?.message).toBe("e10")
  })

  test("gives every entry its own id, including once the log is at its cap", () => {
    // Ids used to be derived from the entry count, which pins to the cap and
    // handed two errors in the same millisecond the same key.
    for (let i = 0; i < 60; i++) errorLogStore.record(anError(`e${i}`))

    const ids = errorLogStore.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("survives a reload, which is when the interesting errors are lost", () => {
    errorLogStore.record(anError("before reload"))

    expect(JSON.parse(localStorage.getItem("suikou-error-log-entries") ?? "[]")).toHaveLength(1)
  })

  test("clear empties both the list and storage", () => {
    errorLogStore.record(anError("gone"))
    errorLogStore.clear()

    expect(errorLogStore.entries).toEqual([])
    expect(JSON.parse(localStorage.getItem("suikou-error-log-entries") ?? "[]")).toEqual([])
  })
})

import { autorun } from "mobx"
import { beforeEach, describe, expect, it } from "vitest"

import { StackProgress } from "./stack-progress"

describe("StackProgress", () => {
  beforeEach(() => localStorage.clear())

  it("starts with every step unread", () => {
    const progress = new StackProgress("r1")
    expect(progress.isRead("aaa")).toBe(false)
    expect(progress.firstUnreadStep(["aaa", "bbb"])).toBe(1)
  })

  it("toggles a step read and back", () => {
    const progress = new StackProgress("r1")
    progress.toggle("aaa")
    expect(progress.isRead("aaa")).toBe(true)
    progress.toggle("aaa")
    expect(progress.isRead("aaa")).toBe(false)
  })

  it("persists marks per review across instances", () => {
    new StackProgress("r1").toggle("aaa")
    expect(new StackProgress("r1").isRead("aaa")).toBe(true)
    expect(new StackProgress("r2").isRead("aaa")).toBe(false)
  })

  it("lands on the first unread step, or step 1 once all are read", () => {
    const progress = new StackProgress("r1")
    progress.toggle("aaa")
    expect(progress.firstUnreadStep(["aaa", "bbb", "ccc"])).toBe(2)
    progress.toggle("bbb")
    progress.toggle("ccc")
    expect(progress.firstUnreadStep(["aaa", "bbb", "ccc"])).toBe(1)
    expect(progress.firstUnreadStep([])).toBe(1)
  })

  it("treats a cherry-picked step as unread", () => {
    const progress = new StackProgress("r1")
    progress.toggle("aaa")
    progress.toggle("bbb")
    expect(progress.firstUnreadStep(["aaa", "bbb", "fix"])).toBe(3)
  })

  it("ignores a corrupt stored value", () => {
    localStorage.setItem("suikou-stack-read:r1", "{not json")
    expect(new StackProgress("r1").isRead("aaa")).toBe(false)
  })

  it("notifies observers when a mark changes", () => {
    const progress = new StackProgress("r1")
    const seen: boolean[] = []
    const dispose = autorun(() => seen.push(progress.isRead("aaa")))
    progress.toggle("aaa")
    dispose()
    expect(seen).toEqual([false, true])
  })
})

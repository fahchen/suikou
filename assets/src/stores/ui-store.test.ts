import { describe, it, expect, beforeEach } from "vitest"

import { UiStore } from "./ui-store"

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe("theme", () => {
  it("defaults to github and applies it to the document", () => {
    const ui = new UiStore()
    expect(ui.theme).toBe("github")
    expect(document.documentElement.dataset.theme).toBe("github")
  })

  it("restores a persisted theme on construction", () => {
    localStorage.setItem("suikou-theme", "catppuccin")
    const ui = new UiStore()
    expect(ui.theme).toBe("catppuccin")
    expect(document.documentElement.dataset.theme).toBe("catppuccin")
  })

  it("ignores an unknown persisted theme", () => {
    localStorage.setItem("suikou-theme", "not-a-theme")
    const ui = new UiStore()
    expect(ui.theme).toBe("github")
  })

  it("persists and applies a theme change", () => {
    const ui = new UiStore()
    ui.setTheme("gruvbox")
    expect(localStorage.getItem("suikou-theme")).toBe("gruvbox")
    expect(document.documentElement.dataset.theme).toBe("gruvbox")
  })
})

describe("layout toggles", () => {
  it("sets and persists the comment mode", () => {
    const ui = new UiStore()
    ui.setCommentMode("inline")
    expect(ui.commentMode).toBe("inline")
    expect(localStorage.getItem("suikou-comment-mode")).toBe("inline")
  })

  it("restores a persisted comment mode on construction", () => {
    localStorage.setItem("suikou-comment-mode", "inline")
    const ui = new UiStore()
    expect(ui.commentMode).toBe("inline")
  })

  it("sets the status filter", () => {
    const ui = new UiStore()
    ui.setStatusFilter("unresolved")
    expect(ui.statusFilter).toBe("unresolved")
  })

  it("toggles a critique type off and back on", () => {
    const ui = new UiStore()
    expect(ui.typeFilters.note).toBe(true)
    ui.toggleType("note")
    expect(ui.typeFilters.note).toBe(false)
    ui.toggleType("note")
    expect(ui.typeFilters.note).toBe(true)
  })
})

describe("diff layout + file display mode", () => {
  it("defaults diffLayout to side-by-side and fileDisplayMode to single", () => {
    const ui = new UiStore()
    expect(ui.diffLayout).toBe("side")
    expect(ui.fileDisplayMode).toBe("single")
  })

  it("persists and restores diffLayout", () => {
    const ui = new UiStore()
    ui.setDiffLayout("unified")
    expect(localStorage.getItem("suikou-diff-layout")).toBe("unified")
    const restored = new UiStore()
    expect(restored.diffLayout).toBe("unified")
  })

  it("ignores an unknown persisted diffLayout", () => {
    localStorage.setItem("suikou-diff-layout", "bogus")
    const ui = new UiStore()
    expect(ui.diffLayout).toBe("side")
  })

  it("persists and restores fileDisplayMode", () => {
    const ui = new UiStore()
    ui.setFileDisplayMode("all")
    expect(localStorage.getItem("suikou-file-display-mode")).toBe("all")
    const restored = new UiStore()
    expect(restored.fileDisplayMode).toBe("all")
  })
})

describe("composer draft lifecycle", () => {
  it("opens with a fresh draft", () => {
    const ui = new UiStore()
    ui.setComposerBody("stale")
    ui.openComposer(12, 12, "artifact")
    expect(ui.draftFor(null)).toMatchObject({
      selStart: 12,
      selEnd: 12,
      scope: "artifact",
      type: "note",
      body: ""
    })
  })

  it("edits the draft body and type", () => {
    const ui = new UiStore()
    ui.openComposer(1, 1, "located")
    ui.setComposerBody("hello")
    ui.setComposerType("fix_required")
    expect(ui.draftFor(null)).toMatchObject({ body: "hello", type: "fix_required" })
  })

  it("closes by dropping the file's draft", () => {
    const ui = new UiStore()
    ui.openComposer(5, 5, "located")
    ui.setComposerBody("draft")
    ui.closeComposer()
    expect(ui.draftFor(null)).toBeUndefined()
  })
})

describe("multi-line selection", () => {
  it("opens a multi-line range", () => {
    const ui = new UiStore()
    ui.openComposer(7, 9, "located")
    expect(ui.draftFor(null)).toMatchObject({ selStart: 7, selEnd: 9 })
  })

  it("extends the range downward and upward keeping the outer bounds", () => {
    const ui = new UiStore()
    ui.openComposer(5, 5, "located")
    ui.extendSelection(8, 9)
    expect(ui.draftFor(null)).toMatchObject({ selStart: 5, selEnd: 9 })
    ui.extendSelection(2, 2)
    expect(ui.draftFor(null)).toMatchObject({ selStart: 2, selEnd: 9 })
  })

  it("seeds the range when extending with no active selection", () => {
    const ui = new UiStore()
    ui.extendSelection(3, 4)
    expect(ui.draftFor(null)).toMatchObject({ selStart: 3, selEnd: 4 })
  })
})

describe("per-file draft isolation", () => {
  it("keeps each file's draft separate and restores it on switch-back", () => {
    const ui = new UiStore()
    ui.openComposer(3, 3, "located", "a.md")
    ui.setComposerBody("on A", "a.md")

    // Switching to B (no draft) shows nothing for B, and never touches A.
    expect(ui.draftFor("b.md")).toBeUndefined()
    expect(ui.draftFor("a.md")).toMatchObject({ selStart: 3, body: "on A" })

    // A draft on B is independent.
    ui.openComposer(7, 7, "located", "b.md")
    ui.setComposerBody("on B", "b.md")
    expect(ui.draftFor("a.md")).toMatchObject({ body: "on A" })
    expect(ui.draftFor("b.md")).toMatchObject({ selStart: 7, body: "on B" })
  })

  it("clears only the submitted file's draft", () => {
    const ui = new UiStore()
    ui.openComposer(1, 1, "located", "a.md")
    ui.setComposerBody("on A", "a.md")
    ui.openComposer(2, 2, "located", "b.md")
    ui.setComposerBody("on B", "b.md")

    ui.closeComposer("a.md")
    expect(ui.draftFor("a.md")).toBeUndefined()
    expect(ui.draftFor("b.md")).toMatchObject({ body: "on B" })
  })
})

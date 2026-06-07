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

describe("view and layout toggles", () => {
  it("sets the view and comment mode", () => {
    const ui = new UiStore()
    ui.setView("raw")
    ui.setCommentMode("inline")
    expect(ui.view).toBe("raw")
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

describe("composer draft lifecycle", () => {
  it("opens with a fresh draft", () => {
    const ui = new UiStore()
    ui.setComposerBody("stale")
    ui.openComposer(12, "file")
    expect(ui.composerLine).toBe(12)
    expect(ui.composerScope).toBe("file")
    expect(ui.composerType).toBe("note")
    expect(ui.composerBody).toBe("")
  })

  it("edits the draft body and type", () => {
    const ui = new UiStore()
    ui.openComposer(1, "line")
    ui.setComposerBody("hello")
    ui.setComposerType("fix_required")
    expect(ui.composerBody).toBe("hello")
    expect(ui.composerType).toBe("fix_required")
  })

  it("closes by clearing the line and body", () => {
    const ui = new UiStore()
    ui.openComposer(5, "line")
    ui.setComposerBody("draft")
    ui.closeComposer()
    expect(ui.composerLine).toBeNull()
    expect(ui.composerBody).toBe("")
  })
})

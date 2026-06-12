import { describe, it, expect } from "vitest"

import { isPreviewable } from "./file-type"

describe("isPreviewable", () => {
  it("treats markdown extensions as previewable", () => {
    expect(isPreviewable("readme.md")).toBe(true)
    expect(isPreviewable("docs/plan.markdown")).toBe(true)
  })

  it("is case-insensitive on the extension", () => {
    expect(isPreviewable("README.MD")).toBe(true)
  })

  it("uses the final extension on multi-dot names", () => {
    expect(isPreviewable("notes.draft.md")).toBe(true)
    expect(isPreviewable("archive.md.zip")).toBe(false)
  })

  it("treats every other type as raw-only", () => {
    expect(isPreviewable("lib/app.ex")).toBe(false)
    expect(isPreviewable("notes.txt")).toBe(false)
    expect(isPreviewable("Makefile")).toBe(false)
    expect(isPreviewable(".gitignore")).toBe(false)
  })
})

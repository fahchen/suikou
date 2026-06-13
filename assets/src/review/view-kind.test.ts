import { describe, it, expect } from "vitest"

import { resolveViewKind, isHtmlPath } from "./view-kind"

function artifact(overrides: { kind?: "file" | "diff"; title?: string } = {}) {
  return { kind: overrides.kind ?? "file", title: overrides.title ?? "src/app.ex" } as const
}

describe("resolveViewKind", () => {
  it("routes diff-kind artifacts to the diff view regardless of extension", () => {
    expect(resolveViewKind(artifact({ kind: "diff", title: "src/app.ex" }))).toBe("diff")
    expect(resolveViewKind(artifact({ kind: "diff", title: "page.html" }))).toBe("diff")
    expect(resolveViewKind(artifact({ kind: "diff", title: "README.md" }))).toBe("diff")
  })

  it("routes .html and .htm file artifacts to the html view", () => {
    expect(resolveViewKind(artifact({ kind: "file", title: "page.html" }))).toBe("html")
    expect(resolveViewKind(artifact({ kind: "file", title: "docs/index.HTM" }))).toBe("html")
  })

  it("routes every other file artifact to the file view", () => {
    expect(resolveViewKind(artifact({ kind: "file", title: "README.md" }))).toBe("file")
    expect(resolveViewKind(artifact({ kind: "file", title: "logo.png" }))).toBe("file")
    expect(resolveViewKind(artifact({ kind: "file", title: "lib/app.ex" }))).toBe("file")
    expect(resolveViewKind(artifact({ kind: "file", title: "Makefile" }))).toBe("file")
  })
})

describe("isHtmlPath", () => {
  it("matches .html and .htm case-insensitively", () => {
    expect(isHtmlPath("page.html")).toBe(true)
    expect(isHtmlPath("page.HTML")).toBe(true)
    expect(isHtmlPath("docs/index.htm")).toBe(true)
  })

  it("uses the final extension on multi-dot names", () => {
    expect(isHtmlPath("notes.html.gz")).toBe(false)
    expect(isHtmlPath("archive.tar.html")).toBe(true)
  })

  it("rejects non-html extensions", () => {
    expect(isHtmlPath("README.md")).toBe(false)
    expect(isHtmlPath("Makefile")).toBe(false)
  })
})

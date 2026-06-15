import { describe, it, expect } from "vitest"

import { resolveViewKind, isHtmlPath, viewCapabilities } from "./view-kind"

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

describe("viewCapabilities", () => {
  it("only exposes diffLayout for diff artifacts", () => {
    const diff = viewCapabilities({
      kind: "diff",
      previewable: false,
      image: false,
      rawView: false,
      binary: false
    })
    expect(diff.diffLayout).toBe(true)
    expect(diff.markdownFlavor).toBe(false)
    expect(diff.rawToggle).toBe(false)
    expect(diff.wrapLines).toBe(false)
  })

  it("exposes markdown + raw toggles for previewable files", () => {
    const md = viewCapabilities({
      kind: "file",
      previewable: true,
      image: false,
      rawView: false,
      binary: false
    })
    expect(md.markdownFlavor).toBe(true)
    expect(md.rawToggle).toBe(true)
    expect(md.density).toBe(true)
    expect(md.wrapLines).toBe(false)
  })

  it("exposes wrap toggle in raw view of a previewable file", () => {
    const raw = viewCapabilities({
      kind: "file",
      previewable: true,
      image: false,
      rawView: true,
      binary: false
    })
    expect(raw.wrapLines).toBe(true)
    expect(raw.markdownFlavor).toBe(false)
  })

  it("hides markdown/wrap/comments controls for images", () => {
    const img = viewCapabilities({
      kind: "file",
      previewable: false,
      image: true,
      rawView: false,
      binary: false
    })
    expect(img.markdownFlavor).toBe(false)
    expect(img.rawToggle).toBe(false)
    expect(img.wrapLines).toBe(false)
    expect(img.comments).toBe(false)
  })

  it("hides comment plumbing for binary content", () => {
    const bin = viewCapabilities({
      kind: "file",
      previewable: false,
      image: false,
      rawView: false,
      binary: true
    })
    expect(bin.comments).toBe(false)
    expect(bin.wrapLines).toBe(false)
  })

  it("exposes raw toggle for html artifacts so source is viewable", () => {
    const rendered = viewCapabilities({
      kind: "html",
      previewable: false,
      image: false,
      rawView: false,
      binary: false
    })
    expect(rendered.rawToggle).toBe(true)
    const raw = viewCapabilities({
      kind: "html",
      previewable: false,
      image: false,
      rawView: true,
      binary: false
    })
    expect(raw.rawToggle).toBe(true)
    expect(raw.diffLayout).toBe(false)
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

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
      sourceView: false,
      binary: false
    })
    expect(diff.diffLayout).toBe(true)
    expect(diff.markdownFlavor).toBe(false)
    expect(diff.sourceToggle).toBe(false)
    expect(diff.htmlInteraction).toBe(false)
    expect(diff.wrapLines).toBe(false)
  })

  it("exposes markdown + source toggles for previewable files", () => {
    const md = viewCapabilities({
      kind: "file",
      previewable: true,
      image: false,
      sourceView: false,
      binary: false
    })
    expect(md.markdownFlavor).toBe(true)
    expect(md.sourceToggle).toBe(true)
    expect(md.htmlInteraction).toBe(false)
    expect(md.density).toBe(true)
    expect(md.wrapLines).toBe(false)
  })

  it("exposes wrap toggle in source view of a previewable file", () => {
    const source = viewCapabilities({
      kind: "file",
      previewable: true,
      image: false,
      sourceView: true,
      binary: false
    })
    expect(source.wrapLines).toBe(true)
    expect(source.markdownFlavor).toBe(false)
  })

  it("hides markdown/wrap/comments controls for images", () => {
    const img = viewCapabilities({
      kind: "file",
      previewable: false,
      image: true,
      sourceView: false,
      binary: false
    })
    expect(img.markdownFlavor).toBe(false)
    expect(img.sourceToggle).toBe(false)
    expect(img.wrapLines).toBe(false)
    expect(img.comments).toBe(false)
  })

  it("hides comment plumbing and the source toggle for binary content", () => {
    const bin = viewCapabilities({
      kind: "file",
      previewable: false,
      image: false,
      sourceView: false,
      binary: true
    })
    expect(bin.comments).toBe(false)
    expect(bin.sourceToggle).toBe(false)
    expect(bin.wrapLines).toBe(false)
  })

  it("exposes the source toggle + html interaction for html artifacts", () => {
    const rendered = viewCapabilities({
      kind: "html",
      previewable: false,
      image: false,
      sourceView: false,
      binary: false
    })
    expect(rendered.sourceToggle).toBe(true)
    expect(rendered.htmlInteraction).toBe(true)
    const source = viewCapabilities({
      kind: "html",
      previewable: false,
      image: false,
      sourceView: true,
      binary: false
    })
    expect(source.sourceToggle).toBe(true)
    // The interaction axis is meaningless in source view; the header gates it on
    // !sourceView, but the capability itself stays kind-driven.
    expect(source.htmlInteraction).toBe(true)
    expect(source.diffLayout).toBe(false)
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

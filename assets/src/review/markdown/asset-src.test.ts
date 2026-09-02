import { describe, expect, test } from "vitest"

import { sanitize } from "./engine"

// A review reads from two roots, and a markdown image says which one it means
// with a leading `@project/` or `@scratch/`. These cases pin how each form
// becomes a raw-file URL, because getting it wrong is invisible until an image
// silently fails to load.
const CTX = { reviewId: "rv1", dir: "@scratch/reports" }

const srcOf = (html: string) => /src="([^"]*)"/.exec(sanitize(html, CTX))?.[1] ?? ""

const pathOf = (html: string) =>
  decodeURIComponent(new URL(srcOf(html), "http://x").searchParams.get("path") ?? "")

describe("markdown image sources", () => {
  test("an unmarked src from a scratch file means the checkout, not its own folder", () => {
    expect(pathOf(`<img src="docs/diagram.png">`)).toBe("docs/diagram.png")
  })

  test("an unmarked src from a checkout file still resolves beside it", () => {
    const html = `<img src="img/diagram.png">`
    const found = /path=([^"]*)/.exec(sanitize(html, { reviewId: "rv1", dir: "docs" }))?.[1] ?? ""

    expect(decodeURIComponent(found)).toBe("docs/img/diagram.png")
  })

  test("a @scratch src addresses the scratch root, not the file's directory", () => {
    expect(pathOf(`<img src="@scratch/shots/round-3.png">`)).toBe("@scratch/shots/round-3.png")
  })

  test("a @project src reaches the checkout, whose paths carry no marker", () => {
    expect(pathOf(`<img src="@project/docs/diagram.png">`)).toBe("docs/diagram.png")
  })

  test("an external src is left alone", () => {
    expect(srcOf(`<img src="https://example.com/x.png">`)).toBe("https://example.com/x.png")
  })
})

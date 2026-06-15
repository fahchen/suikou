import { describe, it, expect, beforeEach } from "vitest"

import { isOutdated, locate, selectorFor } from "./element-selector"

function setupDom(html: string): Document {
  document.body.innerHTML = html
  return document
}

describe("selectorFor", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("uses an id when the element carries one", () => {
    const doc = setupDom(`<section id="intro"><p>hello</p></section>`)
    const p = doc.querySelector("p")!
    const sel = selectorFor(p)
    expect(sel).toBe("#intro > p")
    expect(locate(doc, sel)).toBe(p)
  })

  it("uses :nth-of-type to disambiguate siblings of the same tag", () => {
    const doc = setupDom(
      `<main><ul><li>a</li><li>b</li><li>c</li></ul></main>`
    )
    const second = doc.querySelectorAll("li")[1]!
    const sel = selectorFor(second)
    expect(sel).toContain("li:nth-of-type(2)")
    expect(locate(doc, sel)).toBe(second)
  })

  it("round-trips back to the same element", () => {
    const doc = setupDom(
      `<article>
        <h1>Title</h1>
        <section><p>one</p><p>two</p></section>
        <section><p>three</p></section>
      </article>`
    )
    for (const el of Array.from(doc.querySelectorAll("h1, p, section"))) {
      expect(locate(doc, selectorFor(el))).toBe(el)
    }
  })

  it("escapes special characters in ids", () => {
    const doc = setupDom(`<div id="a.b:c"><span>x</span></div>`)
    const span = doc.querySelector("span")!
    const sel = selectorFor(span)
    expect(locate(doc, sel)).toBe(span)
  })
})

describe("locate", () => {
  it("returns null for invalid selectors instead of throwing", () => {
    setupDom(`<p>x</p>`)
    expect(locate(document, ":::not-a-selector")).toBeNull()
  })

  it("returns null for an empty selector", () => {
    setupDom(`<p>x</p>`)
    expect(locate(document, "")).toBeNull()
  })
})

describe("isOutdated", () => {
  it("is false when the selector resolves and the quote is contained", () => {
    setupDom(`<p id="p1">hello world</p>`)
    expect(isOutdated(document, { selector: "#p1", quote: "hello" })).toBe(false)
  })

  it("is true when the selector misses the live DOM", () => {
    setupDom(`<p>hello</p>`)
    expect(isOutdated(document, { selector: "#gone", quote: "hello" })).toBe(true)
  })

  it("is true when the resolved element no longer contains the stored quote", () => {
    setupDom(`<p id="p1">replaced text</p>`)
    expect(isOutdated(document, { selector: "#p1", quote: "hello" })).toBe(true)
  })

  it("is false for an empty quote when the selector resolves", () => {
    setupDom(`<p id="p1">anything</p>`)
    expect(isOutdated(document, { selector: "#p1", quote: "" })).toBe(false)
  })
})

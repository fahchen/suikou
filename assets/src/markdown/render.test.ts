import { describe, it, expect } from "vitest"

import { renderMarkdown } from "./render"

function items(blocks: Awaited<ReturnType<typeof renderMarkdown>>) {
  return blocks.filter((b) => b.tag === "li")
}

describe("renderMarkdown list splitting", () => {
  it("splits a bullet list into one anchorable block per item", async () => {
    const blocks = await renderMarkdown("- a\n- b\n- c", "github")
    const li = items(blocks)
    expect(li.length).toBe(3)
    expect(li.map((b) => [b.startLine, b.endLine])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3]
    ])
    expect(li[0].html).toContain("<li")
  })

  it("renders a single-item list as exactly one block", async () => {
    const blocks = await renderMarkdown("- only", "github")
    expect(items(blocks).length).toBe(1)
  })

  it("keeps continuous numbering for ordered lists via per-item start", async () => {
    const blocks = await renderMarkdown("1. a\n2. b\n3. c", "github")
    const li = items(blocks)
    expect(li.length).toBe(3)
    // First item is start=1 (default, omitted); later items pin the running number.
    expect(li[0].html).not.toContain("start=")
    expect(li[1].html).toContain('start="2"')
    expect(li[2].html).toContain('start="3"')
  })

  it("honors a non-1 ordered start", async () => {
    const blocks = await renderMarkdown("5. a\n6. b", "github")
    const li = items(blocks)
    expect(li[0].html).toContain('start="5"')
    expect(li[1].html).toContain('start="6"')
  })

  it("makes nested items individually anchorable with deeper indent", async () => {
    const blocks = await renderMarkdown("- a\n- b\n  - c\n- d", "github")
    const li = items(blocks)
    expect(li.length).toBe(4)
    expect(li.map((b) => b.startLine)).toEqual([1, 2, 3, 4])
    // The nested item ("c") sits one depth deeper than its top-level siblings.
    expect(li[0].html).toContain("padding-left:19px")
    expect(li[2].html).toContain("padding-left:38px")
  })

  it("preserves task-list checkboxes per item", async () => {
    const blocks = await renderMarkdown("- [ ] todo\n- [x] done", "github")
    const li = items(blocks)
    expect(li.length).toBe(2)
    expect(li[0].html).toContain('type="checkbox"')
    expect(li[0].html).not.toContain("checked")
    expect(li[1].html).toContain("checked")
  })

  it("leaves non-list blocks untouched", async () => {
    const blocks = await renderMarkdown("# Title\n\nA paragraph.", "github")
    expect(items(blocks).length).toBe(0)
    expect(blocks.map((b) => b.tag)).toEqual(["h1", "p"])
  })
})

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

describe("renderMarkdown table splitting", () => {
  const TABLE = "| H1 | H2 |\n| --- | --- |\n| a | b |\n| c | d |"

  it("splits a table into one anchorable block per row, header first", async () => {
    const rows = (await renderMarkdown(TABLE, "github")).filter((b) => b.tag === "tr")
    expect(rows.length).toBe(3)
    expect(rows.map((b) => [b.startLine, b.endLine])).toEqual([
      [1, 1],
      [3, 3],
      [4, 4]
    ])
  })

  it("renders the header row as a thead and body rows as tbody", async () => {
    const rows = (await renderMarkdown(TABLE, "github")).filter((b) => b.tag === "tr")
    expect(rows[0].html).toContain("<thead>")
    expect(rows[0].html).toContain("H1")
    expect(rows[1].html).toContain("<tbody>")
    expect(rows[1].html).toContain(">a</td>")
  })

  it("gives every row block a shared equal-width colgroup for aligned columns", async () => {
    const rows = (await renderMarkdown(TABLE, "github")).filter((b) => b.tag === "tr")
    for (const row of rows) {
      expect(row.html).toContain("table-layout:fixed")
      expect(row.html.match(/<col /g)?.length).toBe(2)
      expect(row.html).toContain("width:50.0000%")
    }
  })

  it("preserves column alignment styles on aligned cells", async () => {
    const aligned = "| L | R |\n| :--- | ---: |\n| a | b |"
    const rows = (await renderMarkdown(aligned, "github")).filter((b) => b.tag === "tr")
    expect(rows[0].html).toContain("text-align:left")
    expect(rows[0].html).toContain("text-align:right")
  })
})

describe("renderMarkdown code-fence splitting", () => {
  const FENCE = "```javascript\nconst a = 1\nconst b = 2\nconst c = 3\n```"

  it("splits a fenced block into one anchorable block per source line", async () => {
    const code = (await renderMarkdown(FENCE, "github")).filter((b) => b.kind === "code")
    expect(code.length).toBe(3)
    // The fence opens on line 1; its three content lines are source lines 2-4.
    expect(code.map((b) => [b.startLine, b.endLine])).toEqual([
      [2, 2],
      [3, 3],
      [4, 4]
    ])
  })

  it("carries the fence language on every line block", async () => {
    const code = (await renderMarkdown(FENCE, "github")).filter((b) => b.kind === "code")
    expect(code.every((b) => b.lang === "javascript")).toBe(true)
  })

  it("keeps Shiki per-line highlighting as colored spans", async () => {
    const code = (await renderMarkdown(FENCE, "github")).filter((b) => b.kind === "code")
    expect(code[0].html).toContain("md-codeline")
    expect(code[0].html).toMatch(/<span style="color:/)
    expect(code[0].html).toContain("const")
  })

  it("rounds only the first and last line so they stack into one block", async () => {
    const code = (await renderMarkdown(FENCE, "github")).filter((b) => b.kind === "code")
    expect(code[0].html).toContain("border-top-left-radius")
    expect(code[0].html).not.toContain("border-bottom-left-radius")
    expect(code[1].html).not.toContain("border-top-left-radius")
    expect(code[2].html).toContain("border-bottom-left-radius")
  })

  it("escapes HTML-significant characters in code", async () => {
    const code = (await renderMarkdown("```\n<a> & 'b'\n```", "github")).filter(
      (b) => b.kind === "code"
    )
    expect(code[0].html).toContain("&lt;a&gt; &amp; 'b'")
  })

  it("renders mermaid fences as a single block, not per line", async () => {
    const blocks = await renderMarkdown("```mermaid\ngraph TD\nA-->B\n```", "github")
    const mermaid = blocks.filter((b) => b.kind === "mermaid")
    expect(mermaid.length).toBe(1)
  })
})

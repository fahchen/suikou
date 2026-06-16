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
    expect(code[0].html).toMatch(/<span style="color:/)
    expect(code[0].html).toContain("const")
  })

  it("emits no per-line box chrome so the editor can scroll the fence as one", async () => {
    const code = (await renderMarkdown(FENCE, "github")).filter((b) => b.kind === "code")
    for (const block of code) {
      expect(block.html).not.toContain("overflow-x")
      expect(block.html).not.toContain("border-")
      expect(block.html).not.toContain("background")
    }
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

describe("renderMarkdown blockquote splitting", () => {
  function quotes(blocks: Awaited<ReturnType<typeof renderMarkdown>>) {
    return blocks.filter((b) => b.tag === "blockquote")
  }

  it("splits a multi-paragraph blockquote into one block per paragraph", async () => {
    const blocks = await renderMarkdown("> one\n>\n> two\n>\n> three", "github")
    const bq = quotes(blocks)
    expect(bq.length).toBe(3)
    // Blank quote lines separate the paragraphs at source lines 1, 3, 5.
    expect(bq.map((b) => [b.startLine, b.endLine])).toEqual([
      [1, 1],
      [3, 3],
      [5, 5]
    ])
    expect(bq[0].html).toContain("<blockquote")
    expect(bq[0].html).toContain("one")
  })

  it("merges the inner edges so the quote bar stays continuous", async () => {
    const bq = quotes(await renderMarkdown("> one\n>\n> two\n>\n> three", "github"))
    // First keeps its top, drops its bottom; middle drops both; last keeps bottom.
    expect(bq[0].html).toContain("border-bottom:0")
    expect(bq[0].html).not.toContain("border-top:0")
    expect(bq[1].html).toContain("border-top:0")
    expect(bq[1].html).toContain("border-bottom:0")
    expect(bq[2].html).toContain("border-top:0")
    expect(bq[2].html).not.toContain("border-bottom:0")
  })

  it("leaves a single-paragraph blockquote as one block", async () => {
    const bq = quotes(await renderMarkdown("> just one line", "github"))
    expect(bq.length).toBe(1)
    expect(bq[0].html).not.toContain("border-top:0")
    expect(bq[0].html).not.toContain("border-bottom:0")
  })
})

describe("renderMarkdown footnote splitting", () => {
  const DOC = "Text.[^1] More.[^2]\n\n[^1]: First note.\n[^2]: Second note."

  it("makes each footnote definition its own anchorable block", async () => {
    const blocks = await renderMarkdown(DOC, "github")
    const notes = blocks.filter((b) => b.html.includes('class="footnotes"'))
    expect(notes.length).toBe(2)
    expect(notes.map((b) => [b.startLine, b.endLine])).toEqual([
      [3, 3],
      [4, 4]
    ])
    expect(notes.every((b) => b.tag === "li")).toBe(true)
    expect(notes[0].html).toContain("First note.")
    expect(notes[1].html).toContain("Second note.")
  })

  it("keeps footnote numbering via per-item ol start", async () => {
    const notes = (await renderMarkdown(DOC, "github")).filter((b) =>
      b.html.includes('class="footnotes"')
    )
    expect(notes[0].html).not.toContain("start=")
    expect(notes[1].html).toContain('start="2"')
  })

  it("keeps only the first definition's section divider", async () => {
    const notes = (await renderMarkdown(DOC, "github")).filter((b) =>
      b.html.includes('class="footnotes"')
    )
    expect(notes[0].html).not.toContain("border-top:0")
    expect(notes[1].html).toContain("border-top:0")
  })
})

describe("renderMarkdown definition-list splitting", () => {
  const DL = "Term 1\n: Definition 1\n\nTerm 2\n: Definition 2a\n: Definition 2b"

  it("splits a definition list into one anchorable block per term and definition", async () => {
    const items = (await renderMarkdown(DL, "github")).filter(
      (b) => b.tag === "dt" || b.tag === "dd"
    )
    expect(items.map((b) => b.tag)).toEqual(["dt", "dd", "dt", "dd", "dd"])
  })

  it("wraps each item in its own dl with the right element", async () => {
    const items = (await renderMarkdown(DL, "github")).filter(
      (b) => b.tag === "dt" || b.tag === "dd"
    )
    expect(items[0].html).toBe("<dl><dt>Term 1</dt>\n</dl>")
    expect(items[1].html).toContain("<dd>")
    expect(items[1].html).toContain("Definition 1")
  })

  it("anchors each item to its own source line", async () => {
    const items = (await renderMarkdown(DL, "github")).filter(
      (b) => b.tag === "dt" || b.tag === "dd"
    )
    expect(items.map((b) => b.startLine)).toEqual([1, 2, 4, 5, 6])
  })
})

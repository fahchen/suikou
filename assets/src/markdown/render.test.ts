import { describe, it, expect } from "vitest"

import { parseMarkdown, renderCommentBody, type RenderedBlock } from "./render"

function blocksOf(content: string): RenderedBlock[] {
  return parseMarkdown(content, "github").blocks
}

function items(blocks: RenderedBlock[]) {
  return blocks.filter((b) => b.tag === "li")
}

describe("parseMarkdown list splitting", () => {
  it("splits a bullet list into one anchorable block per item", () => {
    const li = items(blocksOf("- a\n- b\n- c"))
    expect(li.length).toBe(3)
    expect(li.map((b) => [b.startLine, b.endLine])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3]
    ])
    expect(li[0].html).toContain("<li")
  })

  it("renders a single-item list as exactly one block", () => {
    expect(items(blocksOf("- only")).length).toBe(1)
  })

  it("keeps continuous numbering for ordered lists via per-item start", () => {
    const li = items(blocksOf("1. a\n2. b\n3. c"))
    expect(li.length).toBe(3)
    // First item is start=1 (default, omitted); later items pin the running number.
    expect(li[0].html).not.toContain("start=")
    expect(li[1].html).toContain('start="2"')
    expect(li[2].html).toContain('start="3"')
  })

  it("honors a non-1 ordered start", () => {
    const li = items(blocksOf("5. a\n6. b"))
    expect(li[0].html).toContain('start="5"')
    expect(li[1].html).toContain('start="6"')
  })

  it("makes nested items individually anchorable with deeper indent", () => {
    const li = items(blocksOf("- a\n- b\n  - c\n- d"))
    expect(li.length).toBe(4)
    expect(li.map((b) => b.startLine)).toEqual([1, 2, 3, 4])
    // The nested item ("c") sits one depth deeper than its top-level siblings.
    expect(li[0].html).toContain("padding-left:19px")
    expect(li[2].html).toContain("padding-left:38px")
  })

  it("preserves task-list checkboxes per item", () => {
    const li = items(blocksOf("- [ ] todo\n- [x] done"))
    expect(li.length).toBe(2)
    expect(li[0].html).toContain('type="checkbox"')
    expect(li[0].html).not.toContain("checked")
    expect(li[1].html).toContain("checked")
  })

  it("leaves non-list blocks untouched", () => {
    const blocks = blocksOf("# Title\n\nA paragraph.")
    expect(items(blocks).length).toBe(0)
    expect(blocks.map((b) => b.tag)).toEqual(["h1", "p"])
  })
})

describe("parseMarkdown table splitting", () => {
  const TABLE = "| H1 | H2 |\n| --- | --- |\n| a | b |\n| c | d |"

  it("splits a table into one anchorable block per row, header first", () => {
    const rows = blocksOf(TABLE).filter((b) => b.tag === "tr")
    expect(rows.length).toBe(3)
    expect(rows.map((b) => [b.startLine, b.endLine])).toEqual([
      [1, 1],
      [3, 3],
      [4, 4]
    ])
  })

  it("emits only the row's cells so the editor can stitch one real table", () => {
    const rows = blocksOf(TABLE).filter((b) => b.tag === "tr")
    expect(rows[0].html).toContain("<th>H1</th>")
    expect(rows[1].html).toContain("<td>a</td>")
    // No per-row table/colgroup/fixed-width hack — one shared table owns layout.
    for (const row of rows) {
      expect(row.html).not.toContain("<table")
      expect(row.html).not.toContain("<colgroup")
      expect(row.html).not.toContain("table-layout")
      expect(row.html).not.toContain("<tr")
    }
  })

  it("preserves column alignment styles on aligned cells", () => {
    const aligned = "| L | R |\n| :--- | ---: |\n| a | b |"
    const rows = blocksOf(aligned).filter((b) => b.tag === "tr")
    expect(rows[0].html).toContain("text-align:left")
    expect(rows[0].html).toContain("text-align:right")
  })
})

describe("parseMarkdown code-fence splitting", () => {
  const FENCE = "```javascript\nconst a = 1\nconst b = 2\nconst c = 3\n```"

  it("splits a fenced block into one anchorable block per source line", () => {
    const code = blocksOf(FENCE).filter((b) => b.kind === "code")
    expect(code.length).toBe(3)
    // The fence opens on line 1; its three content lines are source lines 2-4.
    expect(code.map((b) => [b.startLine, b.endLine])).toEqual([
      [2, 2],
      [3, 3],
      [4, 4]
    ])
  })

  it("carries the fence language on every line block", () => {
    const code = blocksOf(FENCE).filter((b) => b.kind === "code")
    expect(code.every((b) => b.lang === "javascript")).toBe(true)
  })

  it("emits plain code text immediately, deferring Shiki colour to the worker", () => {
    const code = blocksOf(FENCE).filter((b) => b.kind === "code")
    // First paint is uncolored plain text; highlightBlocks swaps in spans later.
    expect(code[0].html).not.toContain("<span")
    expect(code[0].html).toBe("const a = 1")
  })

  it("records one fence job per fenced block for off-thread tokenization", () => {
    const { fences } = parseMarkdown(FENCE, "github")
    expect(fences.length).toBe(1)
    expect(fences[0]).toMatchObject({
      startLine: 2,
      lang: "javascript",
      code: "const a = 1\nconst b = 2\nconst c = 3"
    })
  })

  it("emits no per-line box chrome so the editor can scroll the fence as one", () => {
    const code = blocksOf(FENCE).filter((b) => b.kind === "code")
    for (const block of code) {
      expect(block.html).not.toContain("overflow-x")
      expect(block.html).not.toContain("border-")
      expect(block.html).not.toContain("background")
    }
  })

  it("escapes HTML-significant characters in code", () => {
    const code = blocksOf("```\n<a> & 'b'\n```").filter((b) => b.kind === "code")
    expect(code[0].html).toContain("&lt;a&gt; &amp; 'b'")
  })

  it("renders mermaid fences as a single block, not per line", () => {
    const blocks = blocksOf("```mermaid\ngraph TD\nA-->B\n```")
    const mermaid = blocks.filter((b) => b.kind === "mermaid")
    expect(mermaid.length).toBe(1)
  })

  it("does not record a fence job for a mermaid fence", () => {
    const { fences } = parseMarkdown("```mermaid\ngraph TD\nA-->B\n```", "github")
    expect(fences.length).toBe(0)
  })
})

describe("parseMarkdown blockquote splitting", () => {
  function quotes(blocks: RenderedBlock[]) {
    return blocks.filter((b) => b.tag === "blockquote")
  }

  it("splits a multi-paragraph blockquote into one block per paragraph", () => {
    const bq = quotes(blocksOf("> one\n>\n> two\n>\n> three"))
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

  it("merges the inner edges so the quote bar stays continuous", () => {
    const bq = quotes(blocksOf("> one\n>\n> two\n>\n> three"))
    // First keeps its top, drops its bottom; middle drops both; last keeps bottom.
    expect(bq[0].html).toContain("border-bottom:0")
    expect(bq[0].html).not.toContain("border-top:0")
    expect(bq[1].html).toContain("border-top:0")
    expect(bq[1].html).toContain("border-bottom:0")
    expect(bq[2].html).toContain("border-top:0")
    expect(bq[2].html).not.toContain("border-bottom:0")
  })

  it("leaves a single-paragraph blockquote as one block", () => {
    const bq = quotes(blocksOf("> just one line"))
    expect(bq.length).toBe(1)
    expect(bq[0].html).not.toContain("border-top:0")
    expect(bq[0].html).not.toContain("border-bottom:0")
  })
})

describe("parseMarkdown footnote splitting", () => {
  const DOC = "Text.[^1] More.[^2]\n\n[^1]: First note.\n[^2]: Second note."

  it("makes each footnote definition its own anchorable block", () => {
    const notes = blocksOf(DOC).filter((b) => b.html.includes('class="footnotes"'))
    expect(notes.length).toBe(2)
    expect(notes.map((b) => [b.startLine, b.endLine])).toEqual([
      [3, 3],
      [4, 4]
    ])
    expect(notes.every((b) => b.tag === "li")).toBe(true)
    expect(notes[0].html).toContain("First note.")
    expect(notes[1].html).toContain("Second note.")
  })

  it("keeps footnote numbering via per-item ol start", () => {
    const notes = blocksOf(DOC).filter((b) => b.html.includes('class="footnotes"'))
    expect(notes[0].html).not.toContain("start=")
    expect(notes[1].html).toContain('start="2"')
  })

  it("keeps only the first definition's section divider", () => {
    const notes = blocksOf(DOC).filter((b) => b.html.includes('class="footnotes"'))
    expect(notes[0].html).not.toContain("border-top:0")
    expect(notes[1].html).toContain("border-top:0")
  })
})

describe("parseMarkdown definition-list splitting", () => {
  const DL = "Term 1\n: Definition 1\n\nTerm 2\n: Definition 2a\n: Definition 2b"

  it("splits a definition list into one anchorable block per term and definition", () => {
    const dItems = blocksOf(DL).filter((b) => b.tag === "dt" || b.tag === "dd")
    expect(dItems.map((b) => b.tag)).toEqual(["dt", "dd", "dt", "dd", "dd"])
  })

  it("wraps each item in its own dl with the right element", () => {
    const dItems = blocksOf(DL).filter((b) => b.tag === "dt" || b.tag === "dd")
    expect(dItems[0].html).toBe("<dl><dt>Term 1</dt>\n</dl>")
    expect(dItems[1].html).toContain("<dd>")
    expect(dItems[1].html).toContain("Definition 1")
  })

  it("anchors each item to its own source line", () => {
    const dItems = blocksOf(DL).filter((b) => b.tag === "dt" || b.tag === "dd")
    expect(dItems.map((b) => b.startLine)).toEqual([1, 2, 4, 5, 6])
  })
})

describe("renderCommentBody", () => {
  it("renders GFM (tables, code, bold)", () => {
    const html = renderCommentBody("**hi** `x`\n\n| a | b |\n| - | - |\n| 1 | 2 |")
    expect(html).toContain("<strong>hi</strong>")
    expect(html).toContain("<code>x</code>")
    expect(html).toContain("<table>")
  })

  it("escapes raw HTML and drops script URLs (XSS boundary)", () => {
    const html = renderCommentBody('<img src=x onerror=alert(1)>\n\n[c](javascript:alert(1))')
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;img")
    // markdown-it's validateLink refuses the script URL, so no executable href.
    expect(html).not.toContain('href="javascript:')
  })
})

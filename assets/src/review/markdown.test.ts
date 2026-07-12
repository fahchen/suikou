import { describe, expect, test } from "vitest"

import { renderMarkdownBlocks } from "./markdown"
import { parseFrontmatter } from "./markdown/frontmatter"

describe("renderMarkdownBlocks", () => {
  test("renders each table row as an independently anchored block", () => {
    const blocks = renderMarkdownBlocks("| Name | State |\n| --- | --- |\n| One | Open |\n| Two | Done |")

    expect(blocks.map(({ line, endLine }) => [line, endLine])).toEqual([
      [1, 1],
      [3, 3],
      [4, 4],
    ])
    expect(blocks[0].html).toContain("<thead>")
    expect(blocks[1].html).toContain('class="md-table-block md-table-row"')
    expect(blocks[1].html).not.toContain("<thead")
    expect(blocks[1].html).toContain('aria-label="Table row 1 of 2; columns: Name, State"')
    expect(blocks[1].html).toContain("<td>One</td>")
  })

  test("renders ordered, bullet, and nested items as independently anchored blocks", () => {
    const blocks = renderMarkdownBlocks(
      ["1. First", "   - Child A", "   - Child B", "2. Second", "   1. Nested one", "   2. Nested two"].join("\n"),
    )

    expect(blocks.map(({ line, endLine }) => [line, endLine])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 6],
    ])
    expect(blocks.map(({ html }) => html.match(/^<(ol|ul)/)?.[1])).toEqual(["ol", "ul", "ul", "ol", "ol", "ol"])
    expect(blocks[0].html).toContain('class="md-list-item"')
    expect(blocks[0].html).toContain('start="1"')
    expect(blocks[3].html).toContain('start="2"')
    expect(blocks[1].html).toContain("padding-left:2.6em")
  })

  test("preserves source order across multiple nested lists and continuation text", () => {
    const blocks = renderMarkdownBlocks(
      ["- Parent", "  1. First child", "", "  Continuation", "", "  - Second child"].join("\n"),
    )

    expect(blocks).toHaveLength(4)
    expect(blocks[0]).toMatchObject({ line: 1 })
    expect(blocks[0].html).toContain("Parent")
    expect(blocks[1].html).toContain("First child")
    expect(blocks[2]).toMatchObject({ line: 4, endLine: 4 })
    expect(blocks[2].html).toContain("Continuation")
    expect(blocks[3]).toMatchObject({ line: 6, endLine: 6 })
    expect(blocks[3].html).toContain("Second child")
  })

  test("renders each fenced code line as an independently anchored block", () => {
    const blocks = renderMarkdownBlocks(["```js", "const a = 1", "const b = 2", "```"].join("\n"))

    expect(blocks.map(({ line, endLine }) => [line, endLine])).toEqual([
      [2, 2],
      [3, 3],
    ])
    expect(blocks[0].html).toContain('class="md-code-line md-code-first"')
    expect(blocks[0].html).toContain("const a = 1")
    expect(blocks[1].html).toContain("md-code-last")
  })

  test("keeps mermaid fences as a single block", () => {
    const blocks = renderMarkdownBlocks(["```mermaid", "graph TD", "  A --> B", "```"].join("\n"))

    expect(blocks).toHaveLength(1)
    expect(blocks[0].html).toContain("mermaid-diagram")
  })

  test("lifts leading frontmatter into a metadata card and keeps body line maps", () => {
    const source = ["---", "title: Demo", "tags:", "  - a", "  - b", "---", "", "# Heading", "", "Body text"].join("\n")
    const blocks = renderMarkdownBlocks(source)

    // First block is the frontmatter card spanning the fence lines (1–6).
    expect(blocks[0]).toMatchObject({ line: 1, endLine: 6 })
    expect(blocks[0].html).toContain('class="md-frontmatter"')
    expect(blocks[0].html).toContain("title")
    expect(blocks[0].html).toContain("Demo")
    // The list folds into a single comma-joined value.
    expect(blocks[0].html).toContain("a, b")
    // The body heading keeps its real source line (8), not shifted by the fence.
    expect(blocks[1]).toMatchObject({ line: 8 })
    expect(blocks[1].html).toContain("<h1>Heading</h1>")
  })
})

describe("parseFrontmatter", () => {
  test("returns null without a leading fence", () => {
    expect(parseFrontmatter("# Just a heading\n\nbody")).toBeNull()
    expect(parseFrontmatter("text\n---\nkey: v\n---")).toBeNull()
  })

  test("parses scalars and escapes html-unsafe values", () => {
    const result = parseFrontmatter('---\ntitle: "A <b> value"\ncount: 3\n---\nbody')
    expect(result?.entries).toEqual([
      { key: "title", value: "A <b> value" },
      { key: "count", value: "3" },
    ])
    expect(result?.endLine).toBe(4)
  })
})

import { describe, expect, test } from "vitest"

import { renderMarkdownBlocks } from "./markdown"

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
})

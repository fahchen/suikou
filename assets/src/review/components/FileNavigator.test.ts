import { describe, expect, it } from "vitest"

import { buildTree, type ReviewFileEntry, type TreeNode } from "./FileNavigator"

const entry = (path: string): ReviewFileEntry => ({ path, added: null, deleted: null, change_status: null })

/** The tree as nested labels: a folder row shows its segments joined by `/`. */
function shape(nodes: TreeNode[]): unknown[] {
  return nodes.map((node) =>
    node.kind === "dir" ? { [node.segments.map((s) => s.name).join("/")]: shape(node.children) } : node.name,
  )
}

describe("buildTree", () => {
  it("compacts a chain of folders that each hold only the next one", () => {
    const tree = buildTree([entry("assets/src/board/components/ReviewPane.tsx")])
    expect(shape(tree)).toEqual([{ "assets/src/board/components": ["ReviewPane.tsx"] }])
    const [row] = tree
    expect(row.kind === "dir" && row.segments.map((s) => s.path)).toEqual([
      "assets",
      "assets/src",
      "assets/src/board",
      "assets/src/board/components",
    ])
    expect(row.path).toBe("assets/src/board/components")
  })

  it("stops compacting at a folder that also holds files or several folders", () => {
    const tree = buildTree([
      entry("assets/src/board/components/ReviewPane.tsx"),
      entry("assets/src/board/ProjectsBoard.tsx"),
      entry("assets/src/lib/utils.ts"),
      entry("README.md"),
    ])
    expect(shape(tree)).toEqual([
      {
        "assets/src": [{ board: [{ components: ["ReviewPane.tsx"] }, "ProjectsBoard.tsx"] }, { lib: ["utils.ts"] }],
      },
      "README.md",
    ])
  })
})
